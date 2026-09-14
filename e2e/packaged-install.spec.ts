import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { deb } from './artifacts';

const image = process.env.TD_INSTALL_IMAGE ?? '';
const SCRIPT = 'e2e/deb-install.sh';
const PACKAGE = '/artifacts/package.deb';
const INSTALL_TIMEOUT = 900_000;

interface Report {
  helper: string;
  helperWanted: string;
  launcher: string;
  unresolved: string[];
  user: number;
  windows: string[];
  args: string;
  exit: string;
  sandboxErrors: string[];
}

function reported(lines: string[], key: string): string[] {
  return lines
    .filter((line) => line.startsWith(`${key} `))
    .map((line) => line.slice(key.length + 1));
}

function single(lines: string[], key: string): string {
  return reported(lines, key).join(' ');
}

function parse(output: string): Report {
  const lines = output.split('\n');
  return {
    helper: single(lines, 'helper'),
    helperWanted: single(lines, 'userns') === 'yes' ? '755' : '4755',
    launcher: single(lines, 'launcher'),
    unresolved: reported(lines, 'unresolved'),
    user: Number(single(lines, 'user')),
    windows: reported(lines, 'window'),
    args: single(lines, 'args'),
    exit: single(lines, 'exit'),
    sandboxErrors: reported(lines, 'stderr').filter((line) => /sandbox/iu.test(line))
  };
}

function install(): Report {
  const result = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--security-opt',
      'seccomp=unconfined',
      '--volume',
      `${resolve(deb)}:${PACKAGE}:ro`,
      '--volume',
      `${resolve(SCRIPT)}:/deb-install.sh:ro`,
      image,
      'bash',
      '/deb-install.sh',
      PACKAGE
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: INSTALL_TIMEOUT }
  );
  if (result.status !== 0) {
    throw new Error(
      `${image} could not install and start the package\n${result.stdout}${result.stderr}`
    );
  }
  return parse(result.stdout);
}

describe.skipIf(deb === '' || image === '')('installed package', () => {
  let report: Report;

  beforeAll(() => {
    report = install();
  }, INSTALL_TIMEOUT);

  it('resolves every shipped library from the packages it depends on', () => {
    expect(report.unresolved).toStrictEqual([]);
  });

  it('links the executable into the path and leaves the sandbox helper the kernel policy needs', () => {
    expect(report.launcher).toBe('/opt/TinyDiff/tinydiff');
    expect(report.helper).toBe(report.helperWanted);
  });

  it('starts sandboxed for an unprivileged user and exits cleanly on SIGTERM', () => {
    expect(report.windows).toStrictEqual([]);
    expect(report.user).toBeGreaterThan(0);
    expect(report.args).not.toContain('--no-sandbox');
    expect(report.exit).toBe('0');
    expect(report.sandboxErrors).toStrictEqual([]);
  });
});
