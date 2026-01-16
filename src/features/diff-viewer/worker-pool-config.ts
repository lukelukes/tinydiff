import type { WorkerInitializationRenderOptions, WorkerPoolOptions } from '@pierre/diffs/react';

export const poolOptions: WorkerPoolOptions = {
  workerFactory: () =>
    new Worker(new URL('@pierre/diffs/worker/worker.js', import.meta.url), {
      type: 'module'
    }),
  poolSize: 4
};

export const highlighterOptions: WorkerInitializationRenderOptions = {
  theme: { light: 'pierre-light', dark: 'pierre-dark' },
  lineDiffType: 'word',
  tokenizeMaxLineLength: 10000
};
