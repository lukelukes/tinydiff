import type { Plugin } from 'vite';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vite';

const host = process.env.TAURI_DEV_HOST;

function devScripts(): Plugin {
  return {
    name: 'dev-scripts',
    configureServer(server) {
      server.middlewares.use('/tauri-mock.js', (_req, res) => {
        const filePath = join(import.meta.dirname, 'dev', 'tauri-mock.js');
        const content = readFileSync(filePath, 'utf-8');
        res.setHeader('Content-Type', 'application/javascript');
        res.end(content);
      });
    },
    transformIndexHtml: {
      order: 'pre',
      handler(_html, ctx) {
        if (!ctx.server) {
          return [];
        }

        return [
          { tag: 'script', attrs: { src: '/tauri-mock.js' }, injectTo: 'body' },
          {
            tag: 'script',
            attrs: { src: '//unpkg.com/react-scan/dist/auto.global.js' },
            injectTo: 'head'
          }
        ];
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
