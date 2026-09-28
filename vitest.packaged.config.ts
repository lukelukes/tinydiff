import { defineConfig } from 'vitest/config';

import { e2e, packaged } from './vitest.config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          ...e2e,
          name: 'e2e-package',
          include: ['e2e/app.spec.ts', 'e2e/cli.spec.ts'],
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
