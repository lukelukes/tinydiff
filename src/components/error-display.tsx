interface ErrorDisplayProps {
  title: string;
  error: Error;
  onRetry?: () => void;
}

export function ErrorDisplay({ title, error, onRetry }: ErrorDisplayProps) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-zinc-900 p-4">
      <h2 className="mb-4 text-xl font-medium text-red-400">{title}</h2>
      <pre className="max-w-xl overflow-auto rounded bg-zinc-800 p-4 text-sm text-zinc-300">
        {error.message}
      </pre>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded bg-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-600"
        >
          Retry
        </button>
      )}
    </div>
  );
}
