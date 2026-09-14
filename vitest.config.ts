import { playwright } from '@vitest/browser-playwright';
import type { ViteUserConfig } from 'vitest/config';
import { defineConfig } from 'vitest/config';

import { rendererTestPlugins } from './vite.renderer';

const headed = process.env.HEADED === 'true';

export default defineConfig(async (): Promise<ViteUserConfig> => ({
  test: {
    projects: [
      {
        test: {
          include: ['src/**/*.{test,spec}.ts', 'electron/**/*.{test,spec}.ts'],
          exclude: ['src/**/*.property.spec.ts'],
          name: 'unit',
          environment: 'node',
          setupFiles: ['./src/testing/setup.ts']
        }
      },
      {
        test: {
          include: ['src/**/*.property.spec.ts'],
          name: 'property',
          environment: 'node',
          testTimeout: 120000,
          hookTimeout: 30000,
          setupFiles: ['./src/testing/setup.ts']
        }
      },
      {
        plugins: await rendererTestPlugins(),
        test: {
          name: 'browser',
          browser: {
            provider: playwright(),
            enabled: true,
            headless: !headed,
            instances: [{ browser: 'chromium' }]
          },
          environment: 'node',
          include: ['src/**/*.browser.{test,spec}.{ts,tsx}']
        }
      }
    ]
  }
}));
