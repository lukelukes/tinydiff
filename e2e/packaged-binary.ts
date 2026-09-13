import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

import { flipFuses, FuseV1Options, FuseVersion } from '@electron/fuses';

export interface PackagedBinary {
  executablePath: string;
  dispose(): void;
}

export async function inspectablePackagedBinary(binary: string): Promise<PackagedBinary> {
  const source = resolve(binary);
  const dir = mkdtempSync(join(tmpdir(), 'tinydiff-e2e-binary-'));
  cpSync(dirname(source), dir, { recursive: true });
  const executablePath = join(dir, basename(source));
  await flipFuses(executablePath, {
    version: FuseVersion.V1,
    [FuseV1Options.EnableNodeCliInspectArguments]: true
  });
  return {
    executablePath,
    dispose: () => rmSync(dir, { recursive: true, force: true })
  };
}
