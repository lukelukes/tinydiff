import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { artifacts, EXECUTABLE, extractDeb, INSTALL_DIR, tempDir } from './artifacts';

const SMOKE = resolve('e2e/smoke.sh');
const SMOKE_TIMEOUT = 120_000;

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

  it.each([
    { artifact: 'the AppImage', executable: () => artifacts().appImage },
    {
      artifact: 'the executable extracted from the deb',
      executable: () => join(debRoot, INSTALL_DIR, EXECUTABLE)
    }
  ])('starts $artifact sandboxed and exits cleanly on SIGTERM', ({ executable }) => {
    const result = spawnSync('xvfb-run', ['-a', 'bash', SMOKE, executable()], {
      encoding: 'utf8',
      timeout: SMOKE_TIMEOUT
    });
    expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
  });
});
