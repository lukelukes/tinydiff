interface ErrorDisplayProps {
  title: string;
  error: Error;
  onRetry?: () => void;
}

export function ErrorDisplay({ title, error, onRetry }: ErrorDisplayProps) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-background p-4">
      <h2 className="mb-4 text-xl font-medium text-destructive">{title}</h2>
      <pre className="max-w-xl overflow-auto rounded bg-muted p-4 text-sm text-foreground">
        {error.message}
      </pre>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded bg-secondary px-4 py-2 text-sm text-secondary-foreground hover:bg-secondary/80"
        >
          Retry
        </button>
      )}
    </div>
  );
}
