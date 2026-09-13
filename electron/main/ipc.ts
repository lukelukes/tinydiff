import type { IpcMainInvokeEvent } from 'electron';
import { ipcMain } from 'electron';

import type { TinydiffApi } from '../../src/bindings/api';
import { channels } from './contract';
import { trustedOrigin } from './env';

type Handler<K extends keyof TinydiffApi> = (
  ...args: Parameters<TinydiffApi[K]>
) => ReturnType<TinydiffApi[K]>;

export function handle<K extends keyof TinydiffApi>(name: K, fn: Handler<K>): void {
  ipcMain.handle(channels[name], (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (event.senderFrame?.origin !== trustedOrigin) {
      throw new Error(`${channels[name]} rejected: untrusted sender`);
    }
    return fn(...(args as Parameters<TinydiffApi[K]>));
  });
}
