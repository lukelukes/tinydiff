import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import type { HtmlTagDescriptor, Plugin, PluginOption, UserConfig } from 'vite';

const profilingEnabled = !!process.env.PROFILING_ENABLED;

function devScripts(): Plugin {
  return {
    name: 'dev-scripts',
    transformIndexHtml: {
      order: 'pre',
      handler(_html, ctx) {
        if (!ctx.server) {
          return [];
        }

        const scripts: HtmlTagDescriptor[] = [
          {
            tag: 'script',
            attrs: { type: 'module', src: '/dev/tauri-mock.ts' },
            injectTo: 'head'
          }
        ];

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

export async function rendererTestPlugins(): Promise<PluginOption[]> {
  return [await babel({ presets: [reactCompilerPreset()] }), react(), tailwindcss()];
}

export async function rendererPlugins(): Promise<PluginOption[]> {
  return [...(await rendererTestPlugins()), devScripts()];
}

export const rendererOptions = {
  clearScreen: false,
  build: { assetsInlineLimit: 0 },
  worker: { format: 'es' }
} satisfies UserConfig;
