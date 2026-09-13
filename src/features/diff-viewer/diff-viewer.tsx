import { Alert02Icon, File01Icon, ReloadIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { SelectedLineRange } from '@pierre/diffs';
import type { DiffLineAnnotation, FileContents, MultiFileDiffProps } from '@pierre/diffs/react';
import { MultiFileDiff, Virtualizer } from '@pierre/diffs/react';
import { useMemo } from 'react';

import { getErrorMessage } from '#core/command-error';

import type { Comment, DiffFile } from '../../../tauri-bindings';
import type { CommentFormState, CommentSide } from '../comments';
import { AddCommentButton, CommentDisplay, CommentForm, useReview } from '../comments';
import type { DiffStyle } from './diff-view-context';
import type { GitFileContentsState } from './use-git-file-contents';

export type { SelectedLineRange };

type AnnotationMetadata =
  | { type: 'comment'; comment: Comment }
  | { type: 'form'; startLine?: number };

type DiffProps = MultiFileDiffProps<AnnotationMetadata, undefined>;
type DiffOptions = NonNullable<DiffProps['options']>;

type ReviewData = {
  comments: Comment[];
  form: CommentFormState;
  selectedLines: SelectedLineRange | null;
};

type DiffViewerProps = {
  state: GitFileContentsState;
  onRetry?: () => void;
  isDark?: boolean;
  diffStyle?: DiffStyle;
  review?: ReviewData;
};

type TextDiffProps = {
  oldFile: FileContents;
  newFile: FileContents;
  diffStyle: DiffStyle;
  isDark: boolean;
  options?: Partial<DiffOptions>;
  lineAnnotations?: DiffProps['lineAnnotations'];
  selectedLines?: DiffProps['selectedLines'];
  renderAnnotation?: DiffProps['renderAnnotation'];
  renderGutterUtility?: DiffProps['renderGutterUtility'];
};

type ReviewTextDiffProps = Omit<
  TextDiffProps,
  'options' | 'lineAnnotations' | 'selectedLines' | 'renderAnnotation' | 'renderGutterUtility'
> & {
  review: ReviewData;
};

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
  as: Tag = 'div',
  action
}: {
  title: string;
  subtitle?: string;
  icon: typeof File01Icon;
  iconClass: string;
  iconWrapClass: string;
  as?: 'div' | 'output';
  action?: React.ReactNode;
}) {
  return (
    <Tag className="flex flex-1 items-center justify-center">
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
    </Tag>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <CardState
      title="Error loading diff"
      subtitle={message}
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

function BinaryState({ oldFile, newFile }: { oldFile: DiffFile; newFile: DiffFile }) {
  const oldSize = oldFile.content?.type === 'binary' ? oldFile.content.size : null;
  const newSize = newFile.content?.type === 'binary' ? newFile.content.size : null;
  const size =
    oldSize !== null && newSize !== null && oldSize !== newSize
      ? `${formatBytes(oldSize)} -> ${formatBytes(newSize)}`
      : formatBytes(newSize ?? oldSize ?? 0);
  const ext = extension(newFile.name || oldFile.name);

  return (
    <CardState
      as="output"
      title="Binary content"
      subtitle={ext ? `${ext} · ${size}` : size}
      icon={File01Icon}
      iconClass="text-muted-foreground"
      iconWrapClass="bg-muted/50 ring-1 ring-border/50"
    />
  );
}

function TextDiff({
  oldFile,
  newFile,
  diffStyle,
  isDark,
  options,
  lineAnnotations,
  selectedLines,
  renderAnnotation,
  renderGutterUtility
}: TextDiffProps) {
  const key = cacheKey(oldFile, newFile, diffStyle, isDark);
  const [oldWithCache, newWithCache] = useMemo(
    () =>
      [
        { ...oldFile, cacheKey: `${key}:old` },
        { ...newFile, cacheKey: `${key}:new` }
      ] as const,
    [oldFile, newFile, key]
  );
  const themeType = isDark ? ('dark' as const) : ('light' as const);

  const mergedOptions: DiffOptions = {
    diffStyle,
    overflow: 'scroll',
    themeType,
    expandUnchanged: false,
    ...options
  };

  return (
    <Virtualizer className="flex-1 overflow-auto">
      <MultiFileDiff
        oldFile={oldWithCache}
        newFile={newWithCache}
        options={mergedOptions}
        lineAnnotations={lineAnnotations}
        selectedLines={selectedLines}
        renderAnnotation={renderAnnotation}
        renderGutterUtility={renderGutterUtility}
      />
    </Virtualizer>
  );
}

function ReviewTextDiff({ review, ...diff }: ReviewTextDiffProps) {
  const { comments, form, selectedLines } = review;
  const { addComment } = useReview();
  const canInteract = form.type !== 'pending';

  const options: Partial<DiffOptions> = {
    enableGutterUtility: canInteract,
    enableLineSelection: canInteract,
    onLineSelectionEnd: (range: SelectedLineRange | null) => {
      if (!range) return;
      const side: CommentSide =
        (range.endSide ?? range.side) === 'deletions' ? 'deletions' : 'additions';
      const lineNumber = Math.max(range.start, range.end);
      const startLine = Math.min(range.start, range.end);
      addComment(side, lineNumber, startLine === lineNumber ? undefined : startLine);
    }
  };

  const lineAnnotations = useMemo(() => {
    const annotations: DiffLineAnnotation<AnnotationMetadata>[] = comments.map((comment) => ({
      side: 'additions',
      lineNumber:
        comment.anchor.type === 'orphaned' ? comment.anchor.last_known_line : comment.anchor.line,
      metadata: { type: 'comment', comment }
    }));

    if (form.type === 'pending') {
      annotations.push({
        side: form.comment.side,
        lineNumber: form.comment.lineNumber,
        metadata: { type: 'form', startLine: form.comment.startLine }
      });
    }

    return annotations;
  }, [comments, form]);

  const renderAnnotation = (annotation: DiffLineAnnotation<AnnotationMetadata>) => {
    if (!annotation.metadata) return null;

    if (annotation.metadata.type === 'form') {
      return (
        <CommentForm
          side={annotation.side}
          lineNumber={annotation.lineNumber}
          startLine={annotation.metadata.startLine}
          draft={form.type === 'pending' ? form.draft : ''}
        />
      );
    }

    const comment = annotation.metadata.comment;
    const isEditing = form.type === 'editing' && form.commentId === comment.id;
    return (
      <CommentDisplay
        comment={comment}
        isEditing={isEditing}
        draft={isEditing ? form.draft : undefined}
      />
    );
  };

  const renderGutterUtility = (
    getHoveredLine: () => { lineNumber: number; side: CommentSide } | undefined
  ) => (
    <AddCommentButton
      onClick={() => {
        const hovered = getHoveredLine();
        if (hovered) addComment(hovered.side, hovered.lineNumber);
      }}
    />
  );

  return (
    <TextDiff
      {...diff}
      options={options}
      lineAnnotations={lineAnnotations}
      selectedLines={selectedLines}
      renderAnnotation={renderAnnotation}
      renderGutterUtility={renderGutterUtility}
    />
  );
}

export function DiffViewer({
  state,
  onRetry,
  isDark = false,
  diffStyle = 'split',
  review
}: DiffViewerProps) {
  if (state.status === 'loading') {
    return (
      <CardState
        title="Loading diff..."
        icon={ReloadIcon}
        iconClass="animate-spin text-primary"
        iconWrapClass="bg-primary/10"
      />
    );
  }

  if (state.status === 'error') {
    return <ErrorState message={getErrorMessage(state.error)} onRetry={onRetry} />;
  }

  if (state.status === 'idle') {
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

  const { oldFile, newFile } = state.data;

  if (oldFile.content?.type === 'binary' || newFile.content?.type === 'binary') {
    return <BinaryState oldFile={oldFile} newFile={newFile} />;
  }

  const diff = {
    oldFile: toFileContents(oldFile),
    newFile: toFileContents(newFile),
    diffStyle,
    isDark
  };

  return review ? <ReviewTextDiff {...diff} review={review} /> : <TextDiff {...diff} />;
}
