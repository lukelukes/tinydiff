import type { SelectedLineRange } from '@pierre/diffs';
import type { DiffLineAnnotation, FileContents } from '@pierre/diffs/react';

import { Alert02Icon, File01Icon, ReloadIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { MultiFileDiff } from '@pierre/diffs/react';
import { preloadMultiFileDiff } from '@pierre/diffs/ssr';
import { useEffect, useMemo, useState } from 'react';

import type { Comment, DiffFile } from '../../../tauri-bindings';
import type { PendingComment } from '../comments';
import type { DiffStyle } from './diff-view-provider';

import { AddCommentButton, CommentDisplay, CommentForm } from '../comments';

type AnnotationSide = 'deletions' | 'additions';

export type { SelectedLineRange };

type AnnotationMetadata =
  | { type: 'comment'; comment: Comment }
  | { type: 'form'; startLine?: number };

type ReviewProps = {
  comments?: Comment[];
  pendingComment?: PendingComment | null;
  editingCommentId?: string | null;
  selectedLines?: SelectedLineRange | null;
  onAddComment?: (side: AnnotationSide, lineNumber: number, startLine?: number) => void;
  onSubmitComment?: (
    body: string,
    side: AnnotationSide,
    lineNumber: number,
    startLine?: number
  ) => Promise<void>;
  onCancelComment?: () => void;
  onUpdateComment?: (comment: Comment) => Promise<void>;
  onDeleteComment?: (commentId: string) => Promise<void>;
  onStartEditComment?: (commentId: string) => void;
  onStopEditComment?: () => void;
};

type DiffViewerProps = ReviewProps & {
  oldFile: DiffFile | null;
  newFile: DiffFile | null;
  isLoading: boolean;
  error: string | null;
  onRetry?: () => void;
  isDark?: boolean;
  diffStyle?: DiffStyle;
};

type TextDiffViewerProps = {
  oldFile: FileContents;
  newFile: FileContents;
  diffStyle: DiffStyle;
  isDark: boolean;
  review: ReviewProps;
};

const LARGE_DIFF_LINE_THRESHOLD = 500;
const PRELOAD_TIMEOUT_MS = 10_000;

const formatBytes = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const extension = (name: string) => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot) : '';
};

const toFileContents = (file: DiffFile): FileContents => ({
  name: file.name,
  contents: file.content?.type === 'text' ? file.content.contents : '',
  lang: undefined
});

const lineCount = (content: string) => (content ? content.split('\n').length : 0);

function hash(value: string): number {
  let result = 5381;
  for (let i = 0; i < value.length; i++) {
    result = ((result << 5) + result) ^ (value.codePointAt(i) ?? 0);
  }
  return Math.trunc(result);
}

const cacheKey = (
  oldFile: FileContents,
  newFile: FileContents,
  diffStyle: DiffStyle,
  isDark: boolean
) =>
  `${oldFile.name}:${hash(oldFile.contents)}:${newFile.name}:${hash(newFile.contents)}:${diffStyle}:${isDark ? 'dark' : 'light'}`;

function CardState({
  title,
  subtitle,
  icon,
  iconClass,
  iconWrapClass,
  role,
  action
}: {
  title: string;
  subtitle?: string;
  icon: typeof File01Icon;
  iconClass: string;
  iconWrapClass: string;
  role?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center justify-center" role={role}>
      <div className="mx-auto grid place-items-center text-center">
        <div
          className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${iconWrapClass}`}
        >
          <HugeiconsIcon icon={icon} size={20} className={iconClass} />
        </div>
        <p className="text-sm text-muted-foreground">{title}</p>
        {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
        {action}
      </div>
    </div>
  );
}

function TextDiffViewer({ oldFile, newFile, diffStyle, isDark, review }: TextDiffViewerProps) {
  const {
    comments = [],
    pendingComment,
    editingCommentId,
    selectedLines,
    onAddComment,
    onSubmitComment,
    onCancelComment,
    onUpdateComment,
    onDeleteComment,
    onStartEditComment,
    onStopEditComment
  } = review;

  const totalLines = lineCount(oldFile.contents) + lineCount(newFile.contents);
  const largeDiff = totalLines > LARGE_DIFF_LINE_THRESHOLD;
  const key = cacheKey(oldFile, newFile, diffStyle, isDark);
  const [oldWithCache, newWithCache] = useMemo(
    () =>
      [
        { ...oldFile, cacheKey: key },
        { ...newFile, cacheKey: key }
      ] as const,
    [oldFile, newFile, key]
  );
  const themeType = isDark ? ('dark' as const) : ('light' as const);

  const [prerenderedHTML, setPrerenderedHTML] = useState<string>();
  const [isPreloading, setIsPreloading] = useState(largeDiff);

  useEffect(() => {
    if (!largeDiff) return;

    let active = true;
    const timeoutId = setTimeout(() => {
      if (active) setIsPreloading(false);
    }, PRELOAD_TIMEOUT_MS);

    const startId = setTimeout(() => {
      if (!active) return;
      setIsPreloading(true);
      setPrerenderedHTML(undefined);

      preloadMultiFileDiff({
        oldFile: oldWithCache,
        newFile: newWithCache,
        options: { diffStyle, overflow: 'scroll', themeType, expandUnchanged: false }
      })
        .then((result) => {
          if (!active) return;
          clearTimeout(timeoutId);
          setPrerenderedHTML(result.prerenderedHTML);
          setIsPreloading(false);
          return;
        })
        .catch((error: unknown) => {
          if (!active) return;
          clearTimeout(timeoutId);
          if (!(error instanceof Error && error.message.includes('aborted'))) {
            console.warn('[DiffViewer] Preloading failed:', error);
          }
          setPrerenderedHTML(undefined);
          setIsPreloading(false);
        });
    }, 0);

    return () => {
      active = false;
      clearTimeout(startId);
      clearTimeout(timeoutId);
    };
  }, [largeDiff, oldWithCache, newWithCache, diffStyle, themeType]);

  const canInteract = !pendingComment && !!onAddComment;
  const options = {
    diffStyle,
    overflow: 'scroll' as const,
    themeType,
    expandUnchanged: false,
    enableHoverUtility: canInteract,
    enableLineSelection: canInteract,
    onLineSelectionEnd: (range: SelectedLineRange | null) => {
      if (!range || !onAddComment) return;
      const side: AnnotationSide =
        (range.endSide ?? range.side) === 'deletions' ? 'deletions' : 'additions';
      const lineNumber = Math.max(range.start, range.end);
      const startLine = Math.min(range.start, range.end);
      onAddComment(side, lineNumber, startLine === lineNumber ? undefined : startLine);
    }
  };

  const lineAnnotations = useMemo(() => {
    const annotations: DiffLineAnnotation<AnnotationMetadata>[] = comments.map((comment) => ({
      side: 'additions',
      lineNumber:
        comment.anchor.type === 'orphaned' ? comment.anchor.last_known_line : comment.anchor.line,
      metadata: { type: 'comment', comment }
    }));

    if (pendingComment) {
      annotations.push({
        side: pendingComment.side,
        lineNumber: pendingComment.lineNumber,
        metadata: { type: 'form', startLine: pendingComment.startLine }
      });
    }

    return annotations;
  }, [comments, pendingComment]);

  const renderAnnotation = (annotation: DiffLineAnnotation<AnnotationMetadata>) => {
    if (!annotation.metadata) return null;

    if (annotation.metadata.type === 'form') {
      const startLine = annotation.metadata.startLine;
      return (
        <CommentForm
          onSubmit={async (body) => {
            if (!onSubmitComment) return;
            await onSubmitComment(body, annotation.side, annotation.lineNumber, startLine);
          }}
          onCancel={() => onCancelComment?.()}
        />
      );
    }

    const comment = annotation.metadata.comment;
    return (
      <CommentDisplay
        comment={comment}
        isEditing={editingCommentId === comment.id}
        onStartEdit={
          onStartEditComment
            ? () => {
                onStartEditComment(comment.id);
              }
            : undefined
        }
        onStopEdit={onStopEditComment}
        onUpdate={onUpdateComment}
        onDelete={onDeleteComment}
      />
    );
  };

  const renderHoverUtility = (
    getHoveredLine: () => { lineNumber: number; side: AnnotationSide } | undefined
  ) => {
    if (!onAddComment) return null;
    return (
      <AddCommentButton
        onClick={() => {
          const hovered = getHoveredLine();
          if (hovered) onAddComment(hovered.side, hovered.lineNumber);
        }}
      />
    );
  };

  if (largeDiff && isPreloading) {
    return (
      <CardState
        title="Rendering large diff..."
        subtitle={`${totalLines.toLocaleString()} lines`}
        icon={ReloadIcon}
        iconClass="animate-spin text-primary"
        iconWrapClass="bg-primary/10"
      />
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <MultiFileDiff
        oldFile={oldWithCache}
        newFile={newWithCache}
        options={options}
        prerenderedHTML={largeDiff ? prerenderedHTML : undefined}
        lineAnnotations={lineAnnotations}
        selectedLines={selectedLines}
        renderAnnotation={renderAnnotation}
        renderHoverUtility={onAddComment ? renderHoverUtility : undefined}
      />
    </div>
  );
}

export function DiffViewer({
  oldFile,
  newFile,
  isLoading,
  error,
  onRetry,
  isDark = false,
  diffStyle = 'split',
  ...review
}: DiffViewerProps) {
  if (isLoading) {
    return (
      <CardState
        title="Loading diff..."
        icon={ReloadIcon}
        iconClass="animate-spin text-primary"
        iconWrapClass="bg-primary/10"
      />
    );
  }

  if (error !== null) {
    return (
      <CardState
        title="Error loading diff"
        subtitle={error}
        icon={Alert02Icon}
        iconClass="text-destructive"
        iconWrapClass="bg-destructive/10 ring-1 ring-destructive/20"
        action={
          onRetry ? (
            <button
              onClick={onRetry}
              className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Try again
            </button>
          ) : undefined
        }
      />
    );
  }

  if (!oldFile || !newFile) {
    return (
      <CardState
        title="Select a file to view diff"
        subtitle="Choose from the sidebar"
        icon={File01Icon}
        iconClass="text-muted-foreground"
        iconWrapClass="bg-muted/50 ring-1 ring-border/50"
      />
    );
  }

  if (oldFile.content?.type === 'binary' || newFile.content?.type === 'binary') {
    const oldSize = oldFile.content?.type === 'binary' ? oldFile.content.size : null;
    const newSize = newFile.content?.type === 'binary' ? newFile.content.size : null;
    const size =
      oldSize !== null && newSize !== null && oldSize !== newSize
        ? `${formatBytes(Number(oldSize))} -> ${formatBytes(Number(newSize))}`
        : formatBytes(Number(newSize ?? oldSize ?? 0));
    const ext = extension(newFile.name || oldFile.name);

    return (
      <CardState
        role="status"
        title="Binary content"
        subtitle={ext ? `${ext} · ${size}` : size}
        icon={File01Icon}
        iconClass="text-muted-foreground"
        iconWrapClass="bg-muted/50 ring-1 ring-border/50"
      />
    );
  }

  return (
    <TextDiffViewer
      oldFile={toFileContents(oldFile)}
      newFile={toFileContents(newFile)}
      diffStyle={diffStyle}
      isDark={isDark}
      review={review}
    />
  );
}
