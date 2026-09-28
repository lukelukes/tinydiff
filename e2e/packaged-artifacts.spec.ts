import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  artifacts,
  declaredLibcMinimum,
  EXECUTABLE,
  extractAppImage,
  extractDeb,
  type FuseName,
  GLIBC_BASELINE,
  glibcAbove,
  INSTALL_DIR,
  run,
  shippedFuses,
  tempDir
} from './artifacts';

const REQUIRED_FUSES: Record<FuseName, boolean> = {
  RunAsNode: false,
  EnableCookieEncryption: true,
  EnableNodeOptionsEnvironmentVariable: false,
  EnableNodeCliInspectArguments: false,
  EnableEmbeddedAsarIntegrityValidation: false,
  OnlyLoadAppFromAsar: true,
  LoadBrowserProcessSpecificV8Snapshot: false,
  GrantFileProtocolExtraPrivileges: false
};

interface KernelPolicy {
  kernel: string;
  userNamespaces: boolean;
  sysctls: Record<string, string>;
  mode: string;
}

const PERMITTED = { 'kernel/unprivileged_userns_clone': '1', 'user/max_user_namespaces': '63000' };

const KERNEL_POLICIES: KernelPolicy[] = [
  {
    kernel: 'permits unprivileged user namespaces',
    userNamespaces: true,
    sysctls: PERMITTED,
    mode: '755'
  },
  {
    kernel: 'has no unprivileged_userns_clone switch',
    userNamespaces: true,
    sysctls: { 'user/max_user_namespaces': '63000' },
    mode: '755'
  },
  {
    kernel: 'disables unprivileged user namespaces',
    userNamespaces: true,
    sysctls: { ...PERMITTED, 'kernel/unprivileged_userns_clone': '0' },
    mode: '4755'
  },
  {
    kernel: 'allows no user namespaces',
    userNamespaces: true,
    sysctls: { ...PERMITTED, 'user/max_user_namespaces': '0' },
    mode: '4755'
  },
  {
    kernel: 'hides the user namespace limit',
    userNamespaces: true,
    sysctls: { 'kernel/unprivileged_userns_clone': '1' },
    mode: '4755'
  },
  { kernel: 'lacks user namespaces', userNamespaces: false, sysctls: PERMITTED, mode: '4755' }
];

function fakeProc(dir: string, policy: KernelPolicy): string {
  const proc = join(dir, policy.kernel.replaceAll(' ', '-'));
  mkdirSync(join(proc, 'self/ns'), { recursive: true });
  if (policy.userNamespaces) {
    symlinkSync('user:[4026531837]', join(proc, 'self/ns/user'));
  }
  for (const [name, value] of Object.entries(policy.sysctls)) {
    const file = join(proc, 'sys', name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${value}\n`);
  }
  return proc;
}

describe('packaged artifacts', () => {
  describe('AppImage', () => {
    let dir: string;
    let root: string;

    beforeAll(() => {
      dir = tempDir('appimage');
      root = extractAppImage(artifacts().appImage, dir);
    });

    afterAll(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('ships a launcher and desktop entry that never disable the sandbox', () => {
      const launcher = readFileSync(join(root, 'AppRun'), 'utf8');
      const desktop = readFileSync(join(root, `${EXECUTABLE}.desktop`), 'utf8');
      expect(launcher).not.toContain('no-sandbox');
      expect(launcher).not.toContain('unshare');
      expect(desktop).toContain('Exec=AppRun %U');
      expect(desktop).not.toContain('no-sandbox');
    });

    it('needs no glibc newer than the supported baseline', () => {
      expect(glibcAbove(root, GLIBC_BASELINE)).toStrictEqual([]);
    });

    it('ships the required fuse states', async () => {
      await expect(shippedFuses(join(root, EXECUTABLE))).resolves.toStrictEqual(REQUIRED_FUSES);
    });
  });

  describe('deb', () => {
    let dir: string;
    let root: string;
    let control: string;

    beforeAll(() => {
      dir = tempDir('deb');
      ({ root, control } = extractDeb(artifacts().deb, dir));
    });

    afterAll(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('declares the supported glibc baseline and needs no newer glibc', () => {
      const declared = declaredLibcMinimum(control);
      expect(declared).toBe(GLIBC_BASELINE);
      expect(glibcAbove(root, declared)).toStrictEqual([]);
    });

    it('ships the executable without the AppImage launcher', () => {
      expect(existsSync(join(root, INSTALL_DIR, EXECUTABLE))).toBe(true);
      expect(existsSync(join(root, INSTALL_DIR, 'AppRun'))).toBe(false);
    });

    it('ships the required fuse states', async () => {
      await expect(shippedFuses(join(root, INSTALL_DIR, EXECUTABLE))).resolves.toStrictEqual(
        REQUIRED_FUSES
      );
    });

    it.each(KERNEL_POLICIES)(
      'sets the sandbox helper to $mode when the kernel $kernel',
      (policy) => {
        const script = join(root, INSTALL_DIR, 'resources/sandbox-helper-mode.sh');
        expect(run('sh', [script, fakeProc(dir, policy)]).trim()).toBe(policy.mode);
      }
    );
  });
});
