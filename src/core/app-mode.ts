import { invoke } from '@tauri-apps/api/core';

export type AppMode =
  | { type: 'empty' }
  | { type: 'git'; path: string }
  | { type: 'file'; fileA: string; fileB: string };

const DEFAULT_TIMEOUT_MS = 5000;

export function getAppMode(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<AppMode> {
  return Promise.race([
    invoke<AppMode>('get_app_mode'),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`App initialization timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    })
  ]);
}
