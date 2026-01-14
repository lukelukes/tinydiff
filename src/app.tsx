import type {
  FileContents,
  WorkerInitializationRenderOptions,
  WorkerPoolOptions
} from '@pierre/diffs/react';

import { MultiFileDiff, WorkerPoolContextProvider } from '@pierre/diffs/react';
import { useMemo } from 'react';

import './app.css';

const oldCode = `interface User {
  id: number;
  name: string;
}

function greet(user: User): string {
  return "Hello, " + user.name;
}`;

const newCode = `interface User {
  id: number;
  name: string;
  email: string;
}

function greet(user: User): string {
  return \`Hello, \${user.name}!\`;
}`;

const poolOptions: WorkerPoolOptions = {
  workerFactory: () =>
    new Worker(new URL('@pierre/diffs/worker/worker.js', import.meta.url), { type: 'module' })
};

const highlighterOptions: WorkerInitializationRenderOptions = {
  theme: 'github-dark',
  langs: ['typescript']
};

const diffOptions = { theme: 'github-dark', diffStyle: 'split' } as const;

function App() {
  const oldFile: FileContents = useMemo(
    () => ({ name: 'example.ts', contents: oldCode, lang: 'typescript' }),
    []
  );
  const newFile: FileContents = useMemo(
    () => ({ name: 'example.ts', contents: newCode, lang: 'typescript' }),
    []
  );

  return (
    <WorkerPoolContextProvider poolOptions={poolOptions} highlighterOptions={highlighterOptions}>
      <div className="flex h-full w-full flex-col bg-zinc-900 p-4 text-zinc-100">
        <h1 className="mb-4 text-2xl font-semibold">TinyDiff</h1>
        <div className="flex-1 overflow-auto">
          <MultiFileDiff oldFile={oldFile} newFile={newFile} options={diffOptions} />
        </div>
      </div>
    </WorkerPoolContextProvider>
  );
}

export default App;
