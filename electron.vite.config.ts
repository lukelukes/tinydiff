import { resolve } from 'node:path';

import type { UserConfig } from 'electron-vite';
import { defineConfig } from 'electron-vite';

import { DEV_CSP_NONCE } from './electron/main/csp';
import { rendererOptions, rendererPlugins } from './vite.renderer';

const root = import.meta.dirname;

export default defineConfig(async ({ command }): Promise<UserConfig> => ({
  main: {
    build: { rollupOptions: { input: { index: resolve(root, 'electron/main/index.ts') } } }
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: resolve(root, 'electron/preload/index.ts') },
        output: { format: 'cjs' }
      }
    }
  },
  renderer: {
    ...rendererOptions,
    root: '.',
    plugins: await rendererPlugins(),
    html: command === 'serve' ? { cspNonce: DEV_CSP_NONCE } : undefined,
    build: { rollupOptions: { input: { index: resolve(root, 'index.html') } } }
  }
}));
