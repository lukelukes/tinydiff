import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { artifacts, EXECUTABLE, INSTALL_DIR } from './artifacts';

const IMAGE =
  'debian:13-slim@sha256:d7e12182ce18b85b93007c1dedf31f2d29e01ccf3182cc4017c709b6259bc132';
const PACKAGE = '/artifacts/package.deb';
const INSTALL_TIMEOUT = 900_000;

interface Report {
  helper: string;
  launcher: string;
  unresolved: string[];
  userns: string;
  started: string;
  log: string;
}

function parse(output: string, log: string): Report {
  const lines = output
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const space = line.indexOf(' ');
      return { key: line.slice(0, space), value: line.slice(space + 1) };
    });
  const values = (key: string): string[] =>
    lines.filter((line) => line.key === key).map((line) => line.value);
  const single = (key: string): string => {
    const [value, ...extra] = values(key);
    if (value === undefined || extra.length > 0) {
      throw new Error(`expected exactly one "${key}" line in\n${output}`);
    }
    return value;
  };
  return {
    helper: single('helper'),
    launcher: single('launcher'),
    unresolved: values('unresolved'),
    userns: single('userns'),
    started: single('started'),
    log
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
      `${artifacts().deb}:${PACKAGE}:ro`,
      '--volume',
      `${resolve('e2e/deb-install.sh')}:/deb-install.sh:ro`,
      '--volume',
      `${resolve('e2e/smoke.sh')}:/smoke.sh:ro`,
      IMAGE,
      'bash',
      '/deb-install.sh',
      PACKAGE,
      `/${INSTALL_DIR}`,
      EXECUTABLE
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: INSTALL_TIMEOUT }
  );
  if (result.status !== 0) {
    throw new Error(`${IMAGE} could not install the package\n${result.stdout}${result.stderr}`);
  }
  return parse(result.stdout, result.stderr);
}

describe('installed package', () => {
  let report: Report;

  beforeAll(() => {
    report = install();
  }, INSTALL_TIMEOUT);

  it('resolves every shipped library from the packages it depends on', () => {
    expect(report.unresolved).toStrictEqual([]);
  });

  it('links the executable into the path', () => {
    expect(report.launcher).toBe(`/${INSTALL_DIR}/${EXECUTABLE}`);
  });

  it('makes the sandbox helper setuid exactly where an unprivileged user cannot create a user namespace', () => {
    expect({ userns: report.userns, helper: report.helper }).toBeOneOf([
      { userns: 'yes', helper: '755' },
      { userns: 'no', helper: '4755' }
    ]);
  });

  it('starts sandboxed for an unprivileged user and exits cleanly on SIGTERM', () => {
    expect(report).toMatchObject({ started: 'yes' });
  });
});
