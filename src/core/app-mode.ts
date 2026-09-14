import { commands, type AppMode } from '#bindings/index';

export type { AppMode };

const DEFAULT_TIMEOUT_MS = 5000;

export function getAppMode(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<AppMode> {
  return Promise.race([
    commands.getAppMode(),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`App initialization timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    })
  ]);
}
