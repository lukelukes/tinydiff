import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import type { UserConfig } from 'vite';

const reactCompiler = await babel({ presets: [reactCompilerPreset()] });

export const renderer = {
  clearScreen: false,
  plugins: [reactCompiler, react(), tailwindcss()],
  build: { assetsInlineLimit: 0 },
  worker: { format: 'es' }
} satisfies UserConfig;
