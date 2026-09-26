import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { artifacts, EXECUTABLE, extractDeb, INSTALL_DIR, tempDir } from './artifacts';

const SMOKE = resolve('e2e/smoke.sh');
const SMOKE_TIMEOUT = 120_000;

interface Smoke {
  status: number | null;
  output: string;
}

function smoke(executable: string): Smoke {
  const result = spawnSync('xvfb-run', ['-a', 'bash', SMOKE, executable], {
    encoding: 'utf8',
    timeout: SMOKE_TIMEOUT
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe('packaged artifacts', () => {
  let dir: string;
  let debRoot: string;

  beforeAll(() => {
    dir = tempDir('deb');
    debRoot = extractDeb(artifacts().deb, dir).root;
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('starts the AppImage sandboxed and exits cleanly on SIGTERM', () => {
    expect(smoke(artifacts().appImage)).toMatchObject({ status: 0 });
  });

  it('starts the executable extracted from the deb sandboxed and exits cleanly on SIGTERM', () => {
    expect(smoke(join(debRoot, INSTALL_DIR, EXECUTABLE))).toMatchObject({ status: 0 });
  });
});
