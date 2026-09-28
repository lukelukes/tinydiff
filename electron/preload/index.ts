import { contextBridge, ipcRenderer } from 'electron';

import { channel, methods } from '../main/contract';

contextBridge.exposeInMainWorld(
  'tinydiff',
  Object.fromEntries(
    methods.map((method) => [
      method,
      (...args: unknown[]) => ipcRenderer.invoke(channel(method), ...args)
    ])
  )
);
