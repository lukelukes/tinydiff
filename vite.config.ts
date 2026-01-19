import type { HtmlTagDescriptor, Plugin } from 'vite';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const host = process.env.TAURI_DEV_HOST;
const profilingEnabled = !!process.env.PROFILING_ENABLED;
const isBrowserDev = !process.env.TAURI_ENV_PLATFORM;

function devScripts(): Plugin {
  return {
    name: 'dev-scripts',
    transformIndexHtml: {
      order: 'pre',
      handler(_html, ctx) {
        if (!ctx.server) {
          return [];
        }

        const scripts: HtmlTagDescriptor[] = [];

        if (isBrowserDev) {
          scripts.push({
            tag: 'script',
            attrs: { type: 'module', src: '/dev/tauri-mock.ts' },
            injectTo: 'head'
          });
        }

        if (profilingEnabled) {
          scripts.push({
            tag: 'script',
            attrs: { src: '//unpkg.com/react-scan/dist/auto.global.js' },
            injectTo: 'head'
          });
        }

        return scripts;
      }
    }
  };
}

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler']
      }
    }),
    tailwindcss(),
    devScripts()
  ],
  clearScreen: false,
  worker: {
    format: 'es'
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] }
  }
});
