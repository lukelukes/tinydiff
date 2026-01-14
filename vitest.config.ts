import react from '@vitejs/plugin-react';
import { webdriverio } from '@vitest/browser-webdriverio';
import { defineConfig } from 'vitest/config';

const headed = process.env.HEADED === 'true';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          include: ['src/**/*.{test,spec}.ts'],
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
        plugins: [react()],
        test: {
          name: 'browser',
          browser: {
            provider: webdriverio(),
            enabled: true,
            headless: !headed,
            instances: [{ browser: 'chrome' }]
          },
          environment: 'node',
          include: ['src/**/*.browser.{test,spec}.{ts,tsx}']
        }
      }
    ]
  }
});
