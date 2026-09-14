import type { ChildProcess } from 'node:child_process';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createRepo } from './repo';

const appImage = process.env.TD_SMOKE_APPIMAGE ?? '';
const deb = process.env.TD_SMOKE_DEB ?? '';

const WINDOW_TITLE = '^TinyDiff$';
const POLL_INTERVAL = 250;
const READY_TIMEOUT = 30_000;
const EXIT_TIMEOUT = 10_000;
const INSTALL_PREFIX = 'opt/TinyDiff';
const SANDBOX_HELPER = `${INSTALL_PREFIX}/chrome-sandbox`;
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

interface Exit {
  code: number | null;
  signal: NodeJS.Signals | null;
}

interface Launched {
  child: ChildProcess;
  exited: Promise<Exit>;
  stderr: () => string;
}

interface SmokeResult {
  browserArgs: string[];
  stderr: string;
  exit: Exit;
}

function run(file: string, args: string[], cwd?: string): string {
  return execFileSync(file, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `tinydiff-smoke-${prefix}-`));
}

function sleep(ms: number): Promise<void> {
  return new Promise((done) => {
    setTimeout(done, ms);
  });
}

function parentOf(pid: number): number | null {
  try {
    const status = readFileSync(`/proc/${pid}/status`, 'utf8');
    const ppid = /^PPid:\s+(?<ppid>\d+)/mu.exec(status)?.groups?.ppid;
    return ppid === undefined ? null : Number(ppid);
  } catch {
    return null;
  }
}

function descendsFrom(pid: number, ancestor: number): boolean {
  let current: number | null = pid;
  while (current !== null && current > 1) {
    if (current === ancestor) {
      return true;
    }
    current = parentOf(current);
  }
  return false;
}

function visibleWindowPids(): number[] {
  try {
    return run('xdotool', ['search', '--onlyvisible', '--name', WINDOW_TITLE])
      .split('\n')
      .filter((id) => id !== '')
      .map((id) => Number(run('xdotool', ['getwindowpid', id]).trim()));
  } catch {
    return [];
  }
}

function commandLine(pid: number): string[] {
  return readFileSync(`/proc/${pid}/cmdline`, 'utf8')
    .split('\0')
    .filter((arg) => arg !== '');
}

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

function launch(executable: string, repoDir: string, configDir: string): Launched {
  const child = spawn(executable, [repoDir], {
    env: { ...process.env, XDG_CONFIG_HOME: configDir },
    stdio: ['ignore', 'ignore', 'pipe']
  });
  const chunks: string[] = [];
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk: string) => {
    chunks.push(chunk);
  });
  const exited = new Promise<Exit>((done) => {
    child.once('exit', (code, signal) => {
      done({ code, signal });
    });
  });
  return { child, exited, stderr: () => chunks.join('') };
}

function waitForWindow(launched: Launched): Promise<number> {
  const { child } = launched;
  const ancestor = child.pid ?? 0;
  const deadline = Date.now() + READY_TIMEOUT;
  return new Promise((found, failed) => {
    const poll = (): void => {
      if (hasExited(child)) {
        failed(
          new Error(`${child.spawnfile} exited before showing a window\n${launched.stderr()}`)
        );
        return;
      }
      const pid = visibleWindowPids().find((candidate) => descendsFrom(candidate, ancestor));
      if (pid !== undefined) {
        found(pid);
        return;
      }
      if (Date.now() >= deadline) {
        failed(
          new Error(
            `${child.spawnfile} showed no window within ${READY_TIMEOUT}ms\n${launched.stderr()}`
          )
        );
        return;
      }
      setTimeout(poll, POLL_INTERVAL);
    };
    poll();
  });
}

async function terminate(launched: Launched): Promise<Exit> {
  launched.child.kill('SIGTERM');
  const exit = await Promise.race([launched.exited, sleep(EXIT_TIMEOUT).then(() => null)]);
  if (exit === null) {
    launched.child.kill('SIGKILL');
    throw new Error(`${launched.child.spawnfile} ignored SIGTERM for ${EXIT_TIMEOUT}ms`);
  }
  return exit;
}

async function smoke(executable: string, dirs: string[]): Promise<SmokeResult> {
  const repoDir = createRepo();
  const configDir = tempDir('config');
  dirs.push(repoDir, configDir);
  const launched = launch(executable, repoDir, configDir);
  let browserArgs: string[];
  try {
    browserArgs = commandLine(await waitForWindow(launched));
  } catch (error) {
    await terminate(launched);
    throw error;
  }
  const exit = await terminate(launched);
  return { browserArgs, stderr: launched.stderr(), exit };
}

function extractAppImage(file: string, dir: string): string {
  run(resolve(file), ['--appimage-extract'], dir);
  return join(dir, 'squashfs-root');
}

function extractDebMember(file: string, prefix: string, dir: string): string {
  const archive = resolve(file);
  const member = run('ar', ['t', archive])
    .split('\n')
    .find((entry) => entry.startsWith(prefix));
  if (member === undefined) {
    throw new Error(`${file} has no ${prefix} member`);
  }
  run('ar', ['x', archive, member], dir);
  run('tar', ['-xf', member], dir);
  return dir;
}

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
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

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

    it('starts sandboxed against a repository and exits cleanly on SIGTERM', async () => {
      const result = await smoke(resolve(appImage), dirs);
      expect(result.browserArgs).not.toContain('--no-sandbox');
      expect(result.stderr).not.toMatch(/sandbox/iu);
      expect(result.exit).toStrictEqual({ code: 0, signal: null });
    });
  });

  describe.skipIf(deb === '')('deb', () => {
    let extracted = '';
    let metadata = '';
    let root = '';
    let postinst = '';

    beforeAll(() => {
      extracted = tempDir('deb');
      metadata = tempDir('deb-control');
      root = extractDebMember(deb, 'data.tar', extracted);
      postinst = join(extractDebMember(deb, 'control.tar', metadata), 'postinst');
    });

    afterAll(() => {
      for (const dir of [extracted, metadata]) {
        rmSync(dir, { recursive: true, force: true });
      }
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

    it('starts sandboxed from the extracted package and exits cleanly on SIGTERM', async () => {
      expect(existsSync(join(root, INSTALL_PREFIX, 'AppRun'))).toBe(false);
      const result = await smoke(join(root, INSTALL_PREFIX, 'tinydiff'), dirs);
      expect(result.browserArgs).not.toContain('--no-sandbox');
      expect(result.stderr).not.toMatch(/sandbox/iu);
      expect(result.exit).toStrictEqual({ code: 0, signal: null });
    });
  });
});
