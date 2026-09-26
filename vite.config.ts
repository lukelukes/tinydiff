import type { HtmlTagDescriptor, Plugin } from 'vite';
import { defineConfig } from 'vite';

import { renderer } from './vite.renderer';

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
  ...renderer,
  plugins: [...renderer.plugins, devScripts()],
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/crates/**', '**/out/**', '**/target/**'] }
  }
});
