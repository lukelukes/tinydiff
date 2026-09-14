import type { IpcMainInvokeEvent } from 'electron';
import { ipcMain } from 'electron';

import type { TinydiffApi } from '../../src/bindings/api';
import { channels, methods } from './contract';
import { trustedOrigin } from './env';

export type Handler<K extends keyof TinydiffApi> = (
  ...args: Parameters<TinydiffApi[K]>
) => ReturnType<TinydiffApi[K]>;

export type Handlers = { [K in keyof TinydiffApi]: Handler<K> };

function register<K extends keyof TinydiffApi>(name: K, fn: Handlers[K]): void {
  ipcMain.handle(
    channels[name],
    (event: IpcMainInvokeEvent, ...args: Parameters<TinydiffApi[K]>) => {
      if (event.senderFrame?.origin !== trustedOrigin) {
        throw new Error(`${channels[name]} rejected: untrusted sender`);
      }
      return fn(...args);
    }
  );
}

export function registerIpc(handlers: Handlers): void {
  for (const name of methods) {
    register(name, handlers[name]);
  }
}
