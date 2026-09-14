import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

import { flipFuses, FuseV1Options, FuseVersion, getCurrentFuseWire } from '@electron/fuses';
import { FuseState } from '@electron/fuses/dist/constants';

export interface PackagedBinary {
  executablePath: string;
  dispose: () => void;
}

const SHIPPED_FUSES: ReadonlyArray<[FuseV1Options, boolean]> = [
  [FuseV1Options.RunAsNode, false],
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable, false],
  [FuseV1Options.EnableNodeCliInspectArguments, false],
  [FuseV1Options.OnlyLoadAppFromAsar, true],
  [FuseV1Options.EnableCookieEncryption, true]
];

async function assertShippedFuses(binary: string): Promise<void> {
  const wire = await getCurrentFuseWire(binary);
  const wrong = SHIPPED_FUSES.filter(
    ([option, enabled]) => (wire[option] === FuseState.ENABLE) !== enabled
  ).map(([option, enabled]) => `${FuseV1Options[option]} should be ${enabled ? 'on' : 'off'}`);
  if (wrong.length > 0) {
    throw new Error(`${binary} ships with unexpected fuses: ${wrong.join(', ')}`);
  }
}

export async function inspectablePackagedBinary(binary: string): Promise<PackagedBinary> {
  const source = resolve(binary);
  await assertShippedFuses(source);
  const dir = mkdtempSync(join(tmpdir(), 'tinydiff-e2e-binary-'));
  const dispose = (): void => {
    rmSync(dir, { recursive: true, force: true });
  };
  try {
    cpSync(dirname(source), dir, { recursive: true });
    const executablePath = join(dir, basename(source));
    await flipFuses(executablePath, {
      version: FuseVersion.V1,
      [FuseV1Options.EnableNodeCliInspectArguments]: true
    });
    return { executablePath, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
