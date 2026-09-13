import { defineConfig } from 'vite';

import { rendererOptions, rendererPlugins } from './vite.renderer';

export default defineConfig(async () => ({
  ...rendererOptions,
  plugins: await rendererPlugins(),
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/crates/**', '**/out/**', '**/target/**'] }
  }
}));
