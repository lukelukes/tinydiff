import { contextBridge, ipcRenderer } from 'electron';

import { channels } from '../main/contract';

const api = Object.fromEntries(
  Object.entries<string>(channels).map(([name, channel]) => [
    name,
    (...args: unknown[]) => ipcRenderer.invoke(channel, ...args)
  ])
);

contextBridge.exposeInMainWorld('tinydiff', api);
