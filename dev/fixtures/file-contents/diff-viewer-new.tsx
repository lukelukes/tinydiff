import type { FileContents, SupportedLanguages } from '@pierre/diffs/react';

import { Alert02Icon, File01Icon, ReloadIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { MultiFileDiff } from '@pierre/diffs/react';
import { preloadMultiFileDiff } from '@pierre/diffs/ssr';
import { memo, useEffect, useMemo, useRef, useState } from 'react';

import type { DiffFile } from '../../../tauri-bindings';
import type { DiffStyle } from './diff-view-provider';

interface DiffViewerProps {
  oldFile: DiffFile | null;
  newFile: DiffFile | null;
  isLoading: boolean;
  error: string | null;
  onRetry?: () => void;
  isDark?: boolean;
  diffStyle?: DiffStyle;
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
    lang: (file.lang ?? undefined) as SupportedLanguages | undefined
  };
}

const LARGE_DIFF_LINE_THRESHOLD = 500;

const PRELOAD_TIMEOUT_MS = 10_000;

function countLines(content: string): number {
  if (!content) return 0;
  return content.split('\n').length;
}

function djb2Hash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return hash >>> 0;
}

function generateCacheKey(
  oldFile: FileContents,
  newFile: FileContents,
  diffStyle: DiffStyle,
  isDark: boolean
): string {
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
}

const PreloadedDiffViewer = memo(function PreloadedDiffViewer({
  oldFile,
  newFile,
  diffStyle,
  isDark
}: PreloadedDiffViewerProps) {
  const [prerenderedHTML, setPrerenderedHTML] = useState<string | null>(null);
  const [isPreloading, setIsPreloading] = useState(false);

  const totalLines = useMemo(
    () => countLines(oldFile.contents) + countLines(newFile.contents),
    [oldFile.contents, newFile.contents]
  );

  const large = totalLines > LARGE_DIFF_LINE_THRESHOLD;
  const cacheKey = generateCacheKey(oldFile, newFile, diffStyle, isDark);
  const themeType = isDark ? ('dark' as const) : ('light' as const);

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

  const options = useMemo(
    () => ({
      diffStyle,
      overflow: 'scroll' as const,
      themeType,
      expandUnchanged: false
    }),
    [diffStyle, themeType]
  );

  useEffect(() => {
    if (!large) {
      setPrerenderedHTML(null);
      return;
    }

    renderVersionRef.current += 1;
    const currentVersion = renderVersionRef.current;

    const abortController = new AbortController();
    setIsPreloading(true);

    async function preload() {
      let isCancelled = false;

      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const abortPromise = new Promise<never>((_, reject) => {
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
        const result = await Promise.race([
          preloadMultiFileDiff({
            oldFile: oldFileWithCache,
            newFile: newFileWithCache,
            options
          }),
          abortPromise
        ]);

        if (timeoutId !== undefined) clearTimeout(timeoutId);

        if (!isCancelled && currentVersion === renderVersionRef.current) {
          setPrerenderedHTML(result.prerenderedHTML);
          setIsPreloading(false);
        }
      } catch (error) {
        if (timeoutId !== undefined) clearTimeout(timeoutId);

        const isAbortError =
          error instanceof Error &&
          (error.message.includes('aborted') || error.message.includes('timed out'));

        if (!isAbortError) {
          console.warn('[DiffViewer] Preloading failed, falling back to normal rendering:', error);
        }

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
  }, [
    large,
    oldFile.name,
    oldFile.contents,
    oldFile.lang,
    newFile.name,
    newFile.contents,
    newFile.lang,
    diffStyle,
    themeType,
    cacheKey
  ]);

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
  diffStyle = 'split'
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
    />
  );
}
