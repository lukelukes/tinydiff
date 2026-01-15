import type { AppMode } from '#core/app-mode';

import './app.css';

function EmptyMode() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-zinc-400">
      <h2 className="mb-6 text-xl font-medium text-zinc-200">Welcome to TinyDiff</h2>
      <div className="space-y-4 text-sm">
        <div>
          <code className="rounded bg-zinc-800 px-2 py-1 text-zinc-300">td .</code>
          <span className="ml-3">View git changes in current directory</span>
        </div>
        <div>
          <code className="rounded bg-zinc-800 px-2 py-1 text-zinc-300">td file1 file2</code>
          <span className="ml-3">Compare two files</span>
        </div>
      </div>
    </div>
  );
}

function GitMode({ path }: { path: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-zinc-400">
      <p>Git mode: viewing changes in {path}</p>
      <p className="mt-2 text-sm">(Git status UI coming soon)</p>
    </div>
  );
}

function FileMode({ fileA, fileB }: { fileA: string; fileB: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-zinc-400">
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
      return <GitMode path={mode.path} />;
    case 'file':
      return <FileMode fileA={mode.fileA} fileB={mode.fileB} />;
    default:
      return mode satisfies never;
  }
}

function App({ mode }: { mode: AppMode }) {
  return (
    <div className="flex h-full w-full flex-col bg-zinc-900 p-4 text-zinc-100">
      <h1 className="mb-4 text-2xl font-semibold">TinyDiff</h1>
      <ModeContent mode={mode} />
    </div>
  );
}

export default App;
