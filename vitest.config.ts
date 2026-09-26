import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

import { renderer } from './vite.renderer';

const headed = process.env.HEADED === 'true';

const packaged = 'e2e/packaged-*.spec.ts';

const e2e = {
  environment: 'node',
  testTimeout: 60000,
  hookTimeout: 120000
} as const;

export default defineConfig({
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
        plugins: renderer.plugins,
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
      },
      {
        test: {
          ...e2e,
          name: 'e2e',
          include: ['e2e/**/*.spec.ts'],
          exclude: [packaged]
        }
      },
      {
        test: {
          ...e2e,
          name: 'e2e-package',
          include: ['e2e/app.spec.ts'],
          globalSetup: ['e2e/packaged-binary.ts']
        }
      },
      {
        test: {
          name: 'packaged',
          environment: 'node',
          include: [packaged],
          testTimeout: 180000
        }
      }
    ]
  }
});
