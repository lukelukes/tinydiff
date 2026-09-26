import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

import { defineConfig } from 'electron-vite';

import { DEV_CSP_NONCE_ENV } from './electron/main/csp';
import { renderer } from './vite.renderer';

const root = import.meta.dirname;
const devCspNonce = randomBytes(16).toString('base64');

process.env[DEV_CSP_NONCE_ENV] = devCspNonce;

export default defineConfig(({ command }) => ({
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
    ...renderer,
    root: '.',
    html: command === 'serve' ? { cspNonce: devCspNonce } : undefined,
    build: {
      ...renderer.build,
      rolldownOptions: { input: { index: resolve(root, 'index.html') } }
    }
  }
}));
