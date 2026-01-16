import type { FileContents, SupportedLanguages } from '@pierre/diffs/react';

import type { DiffStyle } from './diff-view-provider';

import { Alert02Icon, File01Icon, ReloadIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { MultiFileDiff } from '@pierre/diffs/react';

import type { FileContents as TauriFileContents } from '../../../tauri-bindings';

interface DiffViewerProps {
  oldFile: TauriFileContents | null;
  newFile: TauriFileContents | null;
  isBinary: boolean;
  isLoading: boolean;
  error: string | null;
  onRetry?: () => void;
  isDark?: boolean;
  diffStyle?: DiffStyle;
}

function toFileContents(file: TauriFileContents): FileContents {
  return {
    name: file.name,
    contents: file.contents,
    lang: (file.lang ?? undefined) as SupportedLanguages | undefined
  };
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

function BinaryFileState() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="mx-auto grid place-items-center text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50 ring-1 ring-border/50">
          <HugeiconsIcon icon={File01Icon} size={20} className="text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">Binary file changed</p>
        <p className="mt-1 text-xs text-muted-foreground">Cannot display diff for binary files</p>
      </div>
    </div>
  );
}

export function DiffViewer({
  oldFile,
  newFile,
  isBinary,
  isLoading,
  error,
  onRetry,
  isDark,
  diffStyle = 'split'
}: DiffViewerProps) {
  const convertedFiles =
    oldFile && newFile
      ? {
          oldFile: toFileContents(oldFile),
          newFile: toFileContents(newFile)
        }
      : null;

  const options = {
    diffStyle,
    overflow: 'scroll' as const,
    themeType: isDark ? ('dark' as const) : ('light' as const),
    expandUnchanged: true
  };

  if (isLoading) return <LoadingState />;
  if (error !== null) return <ErrorState message={error} onRetry={onRetry} />;
  if (isBinary) return <BinaryFileState />;
  if (convertedFiles === null) return <EmptyState />;

  return (
    <div className="flex-1 overflow-auto">
      <MultiFileDiff
        oldFile={convertedFiles.oldFile}
        newFile={convertedFiles.newFile}
        options={options}
      />
    </div>
  );
}
