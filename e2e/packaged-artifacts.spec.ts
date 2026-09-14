import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  appImage,
  deb,
  declaredLibcMinimum,
  extractAppImage,
  extractDebMember,
  GLIBC_BASELINE,
  highestGlibc,
  INSTALL_PREFIX,
  run,
  SANDBOX_HELPER,
  tempDir
} from './artifacts';

const POSTINST_TOOLS = {
  'update-alternatives': 0,
  'update-mime-database': 0,
  'update-desktop-database': 0,
  apparmor_status: 1
};
const AFTER_INSTALL_HARNESS = `
mount --bind "$1/kernel" /proc/sys/kernel
mount --bind "$1/opt" /opt
PATH="$1/bin:$PATH" bash "$2" configure > /dev/null 2>&1
stat -c %a "/${SANDBOX_HELPER}"
`;

function userNamespacesAvailable(): boolean {
  try {
    run('unshare', ['--user', '--map-root-user', 'true']);
    return true;
  } catch {
    return false;
  }
}

function stubTools(stage: string): void {
  const bin = join(stage, 'bin');
  mkdirSync(bin, { recursive: true });
  for (const [tool, status] of Object.entries(POSTINST_TOOLS)) {
    writeFileSync(join(bin, tool), `#!/bin/sh\nexit ${status}\n`, { mode: 0o755 });
  }
}

function sandboxHelperMode(postinst: string, dir: string, unprivilegedUserns: boolean): string {
  const stage = join(dir, unprivilegedUserns ? 'permitted' : 'restricted');
  mkdirSync(join(stage, 'kernel'), { recursive: true });
  mkdirSync(join(stage, INSTALL_PREFIX), { recursive: true });
  writeFileSync(
    join(stage, 'kernel/unprivileged_userns_clone'),
    unprivilegedUserns ? '1\n' : '0\n'
  );
  writeFileSync(join(stage, SANDBOX_HELPER), '', { mode: 0o755 });
  stubTools(stage);
  return run('unshare', [
    '--user',
    '--map-root-user',
    '--mount',
    '--propagation',
    'private',
    'bash',
    '-c',
    AFTER_INSTALL_HARNESS,
    'after-install',
    stage,
    postinst
  ]).trim();
}

describe('packaged artifacts', () => {
  describe.skipIf(appImage === '')('appimage', () => {
    let extracted = '';
    let root = '';

    beforeAll(() => {
      extracted = tempDir('appimage');
      root = extractAppImage(appImage, extracted);
    });

    afterAll(() => {
      rmSync(extracted, { recursive: true, force: true });
    });

    it('ships a launcher and desktop entry that never disable the sandbox', () => {
      const launcher = readFileSync(join(root, 'AppRun'), 'utf8');
      const desktop = readFileSync(join(root, 'tinydiff.desktop'), 'utf8');
      expect(launcher).not.toContain('no-sandbox');
      expect(launcher).not.toContain('unshare');
      expect(desktop).toContain('Exec=AppRun %U');
      expect(desktop).not.toContain('no-sandbox');
    });

    it('needs no glibc newer than the documented baseline', () => {
      expect(highestGlibc(root)).toBe(GLIBC_BASELINE);
    });
  });

  describe.skipIf(deb === '')('deb', () => {
    const dirs: string[] = [];
    let extracted = '';
    let metadata = '';
    let root = '';
    let control = '';
    let postinst = '';

    beforeAll(() => {
      extracted = tempDir('deb');
      metadata = tempDir('deb-control');
      root = extractDebMember(deb, 'data.tar', extracted);
      control = readFileSync(
        join(extractDebMember(deb, 'control.tar', metadata), 'control'),
        'utf8'
      );
      postinst = join(metadata, 'postinst');
    });

    afterEach(() => {
      for (const dir of dirs.splice(0)) {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    afterAll(() => {
      for (const dir of [extracted, metadata]) {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('declares the libc6 minimum that the shipped binaries need', () => {
      expect(highestGlibc(root)).toBe(GLIBC_BASELINE);
      expect(declaredLibcMinimum(control)).toBe(GLIBC_BASELINE);
    });

    it('ships the executable without the AppImage launcher', () => {
      expect(existsSync(join(root, INSTALL_PREFIX, 'tinydiff'))).toBe(true);
      expect(existsSync(join(root, INSTALL_PREFIX, 'AppRun'))).toBe(false);
    });

    it.skipIf(!userNamespacesAvailable())(
      'sets the sandbox helper setuid exactly where unprivileged user namespaces are restricted',
      () => {
        const dir = tempDir('after-install');
        dirs.push(dir);
        expect(readFileSync(postinst, 'utf8')).not.toContain('unshare');
        expect(sandboxHelperMode(postinst, dir, false)).toBe('4755');
        expect(sandboxHelperMode(postinst, dir, true)).toBe('755');
      }
    );
  });
});
