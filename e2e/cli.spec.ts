import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function electronBinary(): string {
  const binary: unknown = createRequire(import.meta.url)('electron');
  if (typeof binary !== 'string') {
    throw new TypeError('electron did not resolve to a binary path');
  }
  return binary;
}

function packageVersion(): string {
  const manifest: unknown = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
  if (
    typeof manifest === 'object' &&
    manifest !== null &&
    'version' in manifest &&
    typeof manifest.version === 'string'
  ) {
    return manifest.version;
  }
  throw new Error('package.json has no version');
}

function runCli(args: string[]): { status: number | null; stdout: string } {
  const packaged = process.env.TD_E2E_BINARY;
  const result = spawnSync(
    packaged ?? electronBinary(),
    packaged ? args : [resolve('.'), ...args],
    { encoding: 'utf8', timeout: 30_000 }
  );
  return { status: result.status, stdout: result.stdout };
}

describe('tinydiff command line', () => {
  it('prints the version and exits without opening a window', () => {
    expect(runCli(['--version'])).toStrictEqual({
      status: 0,
      stdout: `tinydiff ${packageVersion()}\n`
    });
  });

  it('prints usage and exits without opening a window', () => {
    const { status, stdout } = runCli(['-h']);

    expect(status).toBe(0);
    expect(stdout).toContain('Usage: tinydiff [OPTIONS] [PATH]...');
  });
});
