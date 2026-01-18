import type { AppMode } from '#core/app-mode';

import { generateCommentId, useComments } from '#features/comments';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider
} from '#features/components/ui/sidebar';
import {
  DiffViewer,
  DiffViewProvider,
  highlighterOptions,
  poolOptions,
  useDiffView,
  useGitFileContents,
  type SelectedLineRange
} from '#features/diff-viewer';
import { FileTree, useGitStatus } from '#features/file-tree';
import {
  CodeFolderIcon,
  File01Icon,
  GitBranchIcon,
  LayoutTwoColumnIcon,
  LayoutTwoRowIcon,
  Moon02Icon,
  ReloadIcon,
  Sun02Icon
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { WorkerPoolContextProvider } from '@pierre/diffs/react';
import { useMemo, useState } from 'react';

import type { Comment, CommandError, DiffTarget } from '../tauri-bindings';

import './app.css';

function getErrorMessage(error: CommandError): string {
  switch (error.type) {
    case 'path':
      return error.message;
    case 'utf8':
      return `UTF-8 encoding error for ${error.path}`;
    case 'git':
      return error.message;
  }
}

function useTheme() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });

  const toggle = () => {
    setIsDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      return next;
    });
  };

  return { isDark, toggle };
}

function EmptyMode() {
  const { isDark, toggle } = useTheme();

  return (
    <div className="flex flex-1 flex-col items-center justify-center">
      <button
        onClick={toggle}
        className="absolute top-4 right-4 flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted/80 active:scale-95 transition-all text-muted-foreground hover:text-foreground"
        aria-label="Toggle theme"
      >
        <HugeiconsIcon icon={isDark ? Sun02Icon : Moon02Icon} size={16} />
      </button>

      <div className="text-center max-w-sm px-6">
        <div className="mb-6 flex justify-center">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 ring-1 ring-primary/20">
            <HugeiconsIcon icon={CodeFolderIcon} size={28} className="text-primary" />
          </div>
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground mb-1.5">TinyDiff</h1>
        <p className="text-muted-foreground text-sm mb-6">Beautiful, fast diff viewer</p>
        <div className="space-y-2.5 text-left bg-muted/40 rounded-xl p-4 border border-border/50">
          <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
            Quick Start
          </p>
          <div className="flex items-center gap-3">
            <code className="rounded-md bg-background px-2.5 py-1 font-mono text-sm text-foreground border border-border/50">
              td .
            </code>
            <span className="text-sm text-muted-foreground">View git changes</span>
          </div>
          <div className="flex items-center gap-3">
            <code className="rounded-md bg-background px-2.5 py-1 font-mono text-sm text-foreground border border-border/50">
              td a b
            </code>
            <span className="text-sm text-muted-foreground">Compare files</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function GitMode({ path }: { path: string }) {
  const { state, refresh } = useGitStatus(path);
  const { isDark, toggle } = useTheme();
  const { diffStyle, setDiffStyle } = useDiffView();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<DiffTarget | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { state: fileContentsState, refresh: refreshFileContents } = useGitFileContents(
    path,
    selectedFile,
    selectedTarget
  );

  const {
    state: commentsState,
    pendingComment,
    editingCommentId,
    saveComment,
    updateComment,
    deleteComment,
    openCommentForm,
    closeCommentForm,
    startEditing,
    stopEditing
  } = useComments(path);

  const [selectedLines, setSelectedLines] = useState<SelectedLineRange | null>(null);

  const fileComments = useMemo(() => {
    if (commentsState.status !== 'success' || !selectedFile) return [];
    return commentsState.data.comments.filter((c: Comment) => c.filePath === selectedFile);
  }, [commentsState, selectedFile]);

  const handleSelectFile = (filePath: string, target: DiffTarget) => {
    setSelectedFile(filePath);
    setSelectedTarget(target);
    closeCommentForm();
    setSelectedLines(null);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refresh();
    setIsRefreshing(false);
  };

  const handleAddComment = (
    side: 'deletions' | 'additions',
    lineNumber: number,
    startLine?: number
  ) => {
    openCommentForm(side, lineNumber, startLine);
    if (startLine !== undefined) {
      setSelectedLines({
        side,
        start: startLine,
        end: lineNumber
      });
    }
  };

  const handleSubmitComment = async (
    body: string,
    _side: 'deletions' | 'additions',
    lineNumber: number,
    _startLine?: number
  ) => {
    if (!selectedFile) return;

    const newFileContent =
      fileContentsState.status === 'success' &&
      fileContentsState.data.newFile.content?.type === 'text'
        ? fileContentsState.data.newFile.content.contents
        : '';

    const comment: Comment = {
      id: generateCommentId(),
      filePath: selectedFile,
      lineNumber,
      body,
      resolved: false,
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000)
    };

    const result = await saveComment(comment, newFileContent || null);
    if (!result.success) {
      console.error('Failed to save comment:', result.error);
    }
    closeCommentForm();
    setSelectedLines(null);
  };

  const handleCancelComment = () => {
    closeCommentForm();
    setSelectedLines(null);
  };

  const handleUpdateComment = async (comment: Comment) => {
    const newFileContent =
      fileContentsState.status === 'success' &&
      fileContentsState.data.newFile.content?.type === 'text'
        ? fileContentsState.data.newFile.content.contents
        : null;

    const result = await updateComment(comment, newFileContent);
    if (!result.success) {
      console.error('Failed to update comment:', result.error);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    await deleteComment(commentId);
  };

  const diffViewerProps =
    fileContentsState.status === 'success'
      ? {
          oldFile: fileContentsState.data.oldFile,
          newFile: fileContentsState.data.newFile,
          isLoading: false,
          error: null
        }
      : {
          oldFile: null,
          newFile: null,
          isLoading: fileContentsState.status === 'loading',
          error:
            fileContentsState.status === 'error' ? getErrorMessage(fileContentsState.error) : null
        };

  const handleRetry = () => {
    void refreshFileContents();
  };

  // Get folder name from path
  const folderName = path.split('/').pop() ?? path;

  // Count changes
  const changeCount =
    state.status === 'success'
      ? state.data.staged.length + state.data.unstaged.length + state.data.untracked.length
      : 0;

  if (state.status === 'loading') {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
            <HugeiconsIcon icon={ReloadIcon} size={20} className="text-primary animate-spin" />
          </div>
          <p className="text-sm text-muted-foreground">Loading changes...</p>
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="text-center max-w-sm px-6">
          <div className="mb-4 flex justify-center">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-destructive/10 ring-1 ring-destructive/20">
              <HugeiconsIcon icon={CodeFolderIcon} size={24} className="text-destructive" />
            </div>
          </div>
          <p className="text-base font-medium text-foreground mb-1.5">Error loading repository</p>
          <p className="text-sm text-muted-foreground">{getErrorMessage(state.error)}</p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="none" className="border-r border-sidebar-border/60">
        <SidebarHeader className="border-b border-sidebar-border/60 h-12 px-4 justify-center">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-primary/10">
              <HugeiconsIcon icon={GitBranchIcon} size={14} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate text-sidebar-foreground">{folderName}</p>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">{changeCount}</span>
          </div>
        </SidebarHeader>
        <SidebarContent className="px-4 py-3">
          <SidebarGroup className="p-0">
            <SidebarGroupContent>
              <FileTree
                status={state.data}
                selectedFile={selectedFile}
                onSelectFile={handleSelectFile}
              />
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset className="flex flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 px-4 bg-background">
          <div className="flex items-center gap-2">
            {selectedFile && (
              <div className="flex items-center gap-2">
                <HugeiconsIcon icon={File01Icon} size={14} className="text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">{selectedFile}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => {
                setDiffStyle(diffStyle === 'split' ? 'unified' : 'split');
              }}
              className="group flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted/80 active:scale-95 transition-all text-muted-foreground hover:text-foreground"
              aria-label={`Switch to ${diffStyle === 'split' ? 'unified' : 'split'} view`}
            >
              <HugeiconsIcon
                icon={diffStyle === 'split' ? LayoutTwoColumnIcon : LayoutTwoRowIcon}
                size={15}
                className="transition-transform group-hover:scale-110"
              />
            </button>
            <button
              onClick={() => {
                void handleRefresh();
              }}
              className="group flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted/80 active:scale-95 transition-all text-muted-foreground hover:text-foreground"
              aria-label="Refresh"
              disabled={isRefreshing}
            >
              <HugeiconsIcon
                icon={ReloadIcon}
                size={15}
                className={`transition-transform ${isRefreshing ? 'animate-spin' : 'group-hover:rotate-45'}`}
              />
            </button>
            <button
              onClick={toggle}
              className="group flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted/80 active:scale-95 transition-all text-muted-foreground hover:text-foreground"
              aria-label="Toggle theme"
            >
              <HugeiconsIcon
                icon={isDark ? Sun02Icon : Moon02Icon}
                size={15}
                className="transition-transform group-hover:scale-110"
              />
            </button>
          </div>
        </header>

        {/* Main content */}
        <div className="flex flex-1 overflow-hidden">
          <DiffViewer
            {...diffViewerProps}
            onRetry={handleRetry}
            isDark={isDark}
            diffStyle={diffStyle}
            comments={fileComments}
            pendingComment={pendingComment}
            editingCommentId={editingCommentId}
            selectedLines={selectedLines}
            onAddComment={handleAddComment}
            onSubmitComment={handleSubmitComment}
            onCancelComment={handleCancelComment}
            onUpdateComment={handleUpdateComment}
            onDeleteComment={handleDeleteComment}
            onStartEditComment={startEditing}
            onStopEditComment={stopEditing}
          />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function FileMode({ fileA, fileB }: { fileA: string; fileB: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
      <p>File comparison mode</p>
      <p className="mt-2 text-sm">
        Comparing: {fileA} vs {fileB}
      </p>
      <p className="mt-2 text-sm">(Diff view coming soon)</p>
    </div>
  );
}

function ModeContent({ mode }: { mode: AppMode }) {
  switch (mode.type) {
    case 'empty':
      return <EmptyMode />;
    case 'git':
      return (
        <DiffViewProvider>
          <GitMode path={mode.path} />
        </DiffViewProvider>
      );
    case 'file':
      return <FileMode fileA={mode.fileA} fileB={mode.fileB} />;
    default:
      return mode satisfies never;
  }
}

function App({ mode }: { mode: AppMode }) {
  return (
    <WorkerPoolContextProvider poolOptions={poolOptions} highlighterOptions={highlighterOptions}>
      <div className="flex h-full w-full flex-col bg-background text-foreground">
        <ModeContent mode={mode} />
      </div>
    </WorkerPoolContextProvider>
  );
}

export default App;
