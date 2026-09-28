import { cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { flipFuses, FuseV1Options, FuseVersion } from '@electron/fuses';
import type { TestProject } from 'vitest/node';

import { artifacts, EXECUTABLE, tempDir } from './artifacts';

declare module 'vitest' {
  export interface ProvidedContext {
    packagedExecutable?: string;
  }
}

export default async function inspectablePackagedBinary(project: TestProject): Promise<() => void> {
  const dir = tempDir('unpacked');
  const dispose = (): void => {
    rmSync(dir, { recursive: true, force: true });
  };
  try {
    cpSync(artifacts().unpacked, dir, { recursive: true });
    const executablePath = join(dir, EXECUTABLE);
    await flipFuses(executablePath, {
      version: FuseVersion.V1,
      [FuseV1Options.EnableNodeCliInspectArguments]: true
    });
    project.provide('packagedExecutable', executablePath);
    return dispose;
  } catch (error) {
    dispose();
    throw error;
  }
}
