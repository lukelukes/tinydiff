import type { SelectedLineRange } from '@pierre/diffs';
import type { DiffLineAnnotation, FileContents } from '@pierre/diffs/react';

import { Alert02Icon, File01Icon, ReloadIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { MultiFileDiff } from '@pierre/diffs/react';
import { preloadMultiFileDiff } from '@pierre/diffs/ssr';
import { memo, useEffect, useMemo, useRef, useState } from 'react';

import type { Comment, DiffFile } from '../../../tauri-bindings';
import type { PendingComment } from '../comments';
import type { DiffStyle } from './diff-view-provider';

import { AddCommentButton, CommentDisplay, CommentForm } from '../comments';

type AnnotationSide = 'deletions' | 'additions';

export type { SelectedLineRange };

interface CommentAnnotation {
  type: 'comment';
  comment: Comment;
}

interface FormAnnotation {
  type: 'form';
  startLine?: number;
}

type AnnotationMetadata = CommentAnnotation | FormAnnotation;

interface DiffViewerProps {
  oldFile: DiffFile | null;
  newFile: DiffFile | null;
  isLoading: boolean;
  error: string | null;
  onRetry?: () => void;
  isDark?: boolean;
  diffStyle?: DiffStyle;
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
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot) : '';
}

function toFileContents(file: DiffFile): FileContents {
  return {
    name: file.name,
    contents: file.content?.type === 'text' ? file.content.contents : '',
    // oxlint-disable-next-line no-unsafe-type-assertion
    lang: (file.lang ?? 'text') as FileContents['lang']
  };
}

// Threshold for considering a diff "large" - preload for better UX
const LARGE_DIFF_LINE_THRESHOLD = 500;

// Timeout for preloading to prevent UI from being stuck indefinitely
const PRELOAD_TIMEOUT_MS = 10_000;

function countLines(content: string): number {
  if (!content) return 0;
  return content.split('\n').length;
}

function djb2Hash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    const codePoint = str.codePointAt(i) ?? 0;
    hash = ((hash << 5) + hash) ^ codePoint;
  }
  // Convert to unsigned 32-bit integer
  // eslint-disable-next-line unicorn/prefer-math-trunc -- >>> 0 converts to unsigned, Math.trunc doesn't
  return hash >>> 0;
}

// Generate a cache key for the diff based on file contents and options
function generateCacheKey(
  oldFile: FileContents,
  newFile: FileContents,
  diffStyle: DiffStyle,
  isDark: boolean
): string {
  // Hash actual content to ensure unique keys for different files
  const oldHash = djb2Hash(oldFile.contents);
  const newHash = djb2Hash(newFile.contents);
  return `${oldFile.name}:${oldHash}:${newFile.name}:${newHash}:${diffStyle}:${isDark ? 'dark' : 'light'}`;
}

function EmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="mx-auto grid place-items-center text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50 ring-1 ring-border/50">
          <HugeiconsIcon icon={File01Icon} size={20} className="text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">Select a file to view diff</p>
        <p className="mt-1 text-xs text-muted-foreground">Choose from the sidebar</p>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <HugeiconsIcon icon={ReloadIcon} size={20} className="animate-spin text-primary" />
        </div>
        <p className="text-sm text-muted-foreground">Loading diff...</p>
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center">
      <div className="max-w-sm px-6 text-center">
        <div className="mb-4 flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10 ring-1 ring-destructive/20">
            <HugeiconsIcon icon={Alert02Icon} size={24} className="text-destructive" />
          </div>
        </div>
        <p className="mb-1.5 text-base font-medium text-foreground">Error loading diff</p>
        <p className="text-sm text-muted-foreground">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

function BinaryFileState({ oldFile, newFile }: { oldFile: DiffFile; newFile: DiffFile }) {
  const oldSize = oldFile.content?.type === 'binary' ? oldFile.content.size : null;
  const newSize = newFile.content?.type === 'binary' ? newFile.content.size : null;
  const ext = getExtension(newFile.name || oldFile.name);

  // Build metadata line: ".ext · size" or just "size"
  const sizePart = (() => {
    if (oldSize !== null && newSize !== null && oldSize !== newSize) {
      return `${formatFileSize(Number(oldSize))} → ${formatFileSize(Number(newSize))}`;
    }
    return formatFileSize(Number(newSize ?? oldSize ?? 0));
  })();
  const metadata = ext ? `${ext} · ${sizePart}` : sizePart;

  return (
    <div className="flex flex-1 items-center justify-center" role="status">
      <div className="mx-auto grid place-items-center text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50 ring-1 ring-border/50">
          <HugeiconsIcon icon={File01Icon} size={20} className="text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">Binary content</p>
        <p className="mt-1 text-xs text-muted-foreground">{metadata}</p>
      </div>
    </div>
  );
}

function PreloadingState({ totalLines }: { totalLines: number }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <HugeiconsIcon icon={ReloadIcon} size={20} className="animate-spin text-primary" />
        </div>
        <p className="text-sm text-muted-foreground">Rendering large diff...</p>
        <p className="text-xs text-muted-foreground/60">{totalLines.toLocaleString()} lines</p>
      </div>
    </div>
  );
}

interface PreloadedDiffViewerProps {
  oldFile: FileContents;
  newFile: FileContents;
  diffStyle: DiffStyle;
  isDark: boolean;
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
}

const PreloadedDiffViewer = memo(function PreloadedDiffViewer({
  oldFile,
  newFile,
  diffStyle,
  isDark,
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
}: PreloadedDiffViewerProps) {
  const totalLines = useMemo(
    () => countLines(oldFile.contents) + countLines(newFile.contents),
    [oldFile.contents, newFile.contents]
  );

  const large = totalLines > LARGE_DIFF_LINE_THRESHOLD;
  const cacheKey = generateCacheKey(oldFile, newFile, diffStyle, isDark);
  const themeType = isDark ? ('dark' as const) : ('light' as const);

  const [prerenderedHTML, setPrerenderedHTML] = useState<string | null>(null);
  const [isPreloading, setIsPreloading] = useState(large);

  const renderVersionRef = useRef(0);

  const oldFileWithCache = useMemo(
    () => ({
      name: oldFile.name,
      contents: oldFile.contents,
      lang: oldFile.lang,
      cacheKey
    }),
    [oldFile.name, oldFile.contents, oldFile.lang, cacheKey]
  );
  const newFileWithCache = useMemo(
    () => ({
      name: newFile.name,
      contents: newFile.contents,
      lang: newFile.lang,
      cacheKey
    }),
    [newFile.name, newFile.contents, newFile.lang, cacheKey]
  );

  const preloadOptions = useMemo(
    () => ({
      diffStyle,
      overflow: 'scroll' as const,
      themeType,
      expandUnchanged: false
    }),
    [diffStyle, themeType]
  );

  const hasOpenCommentForm = pendingComment !== null;

  const options = useMemo(
    () => ({
      diffStyle,
      overflow: 'scroll' as const,
      themeType,
      expandUnchanged: false,
      enableHoverUtility: !hasOpenCommentForm && !!onAddComment,
      enableLineSelection: !hasOpenCommentForm && !!onAddComment,
      onLineSelectionEnd: (range: SelectedLineRange | null) => {
        if (range === null || !onAddComment) return;
        const derivedSide = range.endSide ?? range.side;
        const side: AnnotationSide = derivedSide === 'deletions' ? 'deletions' : 'additions';
        const endLine = Math.max(range.end, range.start);
        const startLine = Math.min(range.end, range.start);
        onAddComment(side, endLine, startLine === endLine ? undefined : startLine);
      }
    }),
    [diffStyle, themeType, hasOpenCommentForm, onAddComment]
  );

  const lineAnnotations = useMemo(() => {
    const annotations: DiffLineAnnotation<AnnotationMetadata>[] = [];

    for (const comment of comments) {
      annotations.push({
        side: 'additions',
        lineNumber: comment.lineNumber,
        metadata: { type: 'comment', comment }
      });
    }

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
      const { startLine } = annotation.metadata;
      return (
        <CommentForm
          onSubmit={async (body) => {
            if (onSubmitComment) {
              await onSubmitComment(body, annotation.side, annotation.lineNumber, startLine);
            }
          }}
          onCancel={() => onCancelComment?.()}
        />
      );
    }

    const c = annotation.metadata.comment;
    return (
      <CommentDisplay
        comment={c}
        isEditing={editingCommentId === c.id}
        onStartEdit={
          onStartEditComment
            ? () => {
                onStartEditComment(c.id);
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
          if (hovered) {
            onAddComment(hovered.side, hovered.lineNumber);
          }
        }}
      />
    );
  };

  useEffect(() => {
    if (!large) {
      return;
    }

    renderVersionRef.current += 1;
    const currentVersion = renderVersionRef.current;

    const abortController = new AbortController();
    // eslint-disable-next-line react-hooks-js/set-state-in-effect -- preload initialization, async results handled in callback
    setIsPreloading(true);
    // eslint-disable-next-line react-hooks-js/set-state-in-effect -- clear stale prerendered HTML before new preload
    setPrerenderedHTML(null);

    async function preload() {
      let isCancelled = false;

      // Create abort promise that rejects when cleanup runs or timeout expires
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const abortPromise = new Promise<never>((_, reject) => {
        // Register abort listener first to ensure isCancelled is set before rejection
        abortController.signal.addEventListener(
          'abort',
          () => {
            isCancelled = true;
            if (timeoutId !== undefined) clearTimeout(timeoutId);
            reject(new Error('Preloading aborted'));
          },
          { once: true }
        );

        timeoutId = setTimeout(() => {
          isCancelled = true;
          reject(new Error(`Preloading timed out after ${PRELOAD_TIMEOUT_MS}ms`));
        }, PRELOAD_TIMEOUT_MS);
      });

      try {
        // Race preload against abort/timeout - abandon result if aborted
        const result = await Promise.race([
          preloadMultiFileDiff({
            oldFile: oldFileWithCache,
            newFile: newFileWithCache,
            options: preloadOptions
          }),
          abortPromise
        ]);

        // Clear timeout on success to prevent memory leak
        if (timeoutId !== undefined) clearTimeout(timeoutId);

        // Only apply result if this is still the current render and not cancelled
        if (!isCancelled && currentVersion === renderVersionRef.current) {
          setPrerenderedHTML(result.prerenderedHTML);
          setIsPreloading(false);
        }
      } catch (error) {
        // Clear timeout to prevent memory leak
        if (timeoutId !== undefined) clearTimeout(timeoutId);

        // Skip logging for expected abort/timeout errors
        const isAbortError =
          error instanceof Error &&
          (error.message.includes('aborted') || error.message.includes('timed out'));

        if (!isAbortError) {
          console.warn('[DiffViewer] Preloading failed, falling back to normal rendering:', error);
        }

        // Fall back to normal rendering if not cancelled
        if (!isCancelled && currentVersion === renderVersionRef.current) {
          setPrerenderedHTML(null);
          setIsPreloading(false);
        }
      }
    }

    void preload();

    return () => {
      abortController.abort();
    };
  }, [large, oldFileWithCache, newFileWithCache, preloadOptions]);

  // Show preloading state for large diffs
  if (large && isPreloading) {
    return <PreloadingState totalLines={totalLines} />;
  }

  return (
    <div className="flex-1 overflow-auto">
      <MultiFileDiff
        oldFile={oldFileWithCache}
        newFile={newFileWithCache}
        options={options}
        prerenderedHTML={prerenderedHTML ?? undefined}
        lineAnnotations={lineAnnotations}
        selectedLines={selectedLines}
        renderAnnotation={renderAnnotation}
        renderHoverUtility={onAddComment ? renderHoverUtility : undefined}
      />
    </div>
  );
});

export function DiffViewer({
  oldFile,
  newFile,
  isLoading,
  error,
  onRetry,
  isDark = false,
  diffStyle = 'split',
  comments,
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
}: DiffViewerProps) {
  if (isLoading) return <LoadingState />;
  if (error !== null) return <ErrorState message={error} onRetry={onRetry} />;
  if (!oldFile || !newFile) return <EmptyState />;

  const hasBinary = oldFile.content?.type === 'binary' || newFile.content?.type === 'binary';
  if (hasBinary) return <BinaryFileState oldFile={oldFile} newFile={newFile} />;

  const convertedOldFile = toFileContents(oldFile);
  const convertedNewFile = toFileContents(newFile);

  return (
    <PreloadedDiffViewer
      key={`${convertedOldFile.name}:${convertedNewFile.name}`}
      oldFile={convertedOldFile}
      newFile={convertedNewFile}
      diffStyle={diffStyle}
      isDark={isDark}
      comments={comments}
      pendingComment={pendingComment}
      editingCommentId={editingCommentId}
      selectedLines={selectedLines}
      onAddComment={onAddComment}
      onSubmitComment={onSubmitComment}
      onCancelComment={onCancelComment}
      onUpdateComment={onUpdateComment}
      onDeleteComment={onDeleteComment}
      onStartEditComment={onStartEditComment}
      onStopEditComment={onStopEditComment}
    />
  );
}
