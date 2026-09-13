import { contextBridge, ipcRenderer } from 'electron';

import type { TinydiffApi } from '../../src/bindings/api';
import { channels } from '../main/contract';

const methods = Object.keys(channels) as (keyof TinydiffApi)[];

const api = Object.fromEntries(
  methods.map((name) => [name, (...args: unknown[]) => ipcRenderer.invoke(channels[name], ...args)])
) as unknown as TinydiffApi;

contextBridge.exposeInMainWorld('tinydiff', api);
