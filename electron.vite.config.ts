import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

import type { UserConfig } from 'electron-vite';
import { defineConfig } from 'electron-vite';

import { DEV_CSP_NONCE_ENV } from './electron/main/csp';
import { rendererOptions, rendererPlugins } from './vite.renderer';

const root = import.meta.dirname;

function devCspNonce(): string {
  const nonce = randomBytes(16).toString('base64');
  process.env[DEV_CSP_NONCE_ENV] = nonce;
  return nonce;
}

export default defineConfig(async ({ command }): Promise<UserConfig> => ({
  main: {
    build: { rolldownOptions: { input: { index: resolve(root, 'electron/main/index.ts') } } }
  },
  preload: {
    build: {
      rolldownOptions: {
        input: { index: resolve(root, 'electron/preload/index.ts') },
        output: { format: 'cjs' }
      }
    }
  },
  renderer: {
    ...rendererOptions,
    root: '.',
    plugins: await rendererPlugins(),
    html: command === 'serve' ? { cspNonce: devCspNonce() } : undefined,
    build: {
      ...rendererOptions.build,
      rolldownOptions: { input: { index: resolve(root, 'index.html') } }
    }
  }
}));
