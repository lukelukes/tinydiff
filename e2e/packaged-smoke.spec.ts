import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { appImage, deb, extractDebMember, INSTALL_PREFIX, run, tempDir } from './artifacts';
import { createRepo } from './repo';

const WINDOW_TITLE = '^TinyDiff$';
const POLL_INTERVAL = 250;
const READY_TIMEOUT = 30_000;
const EXIT_TIMEOUT = 10_000;

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
  const child = spawn(executable, ['--ozone-platform=x11', repoDir], {
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

describe('packaged artifacts', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  describe.skipIf(appImage === '')('appimage', () => {
    it('starts sandboxed against a repository and exits cleanly on SIGTERM', async () => {
      const result = await smoke(resolve(appImage), dirs);
      expect(result.browserArgs).not.toContain('--no-sandbox');
      expect(result.stderr).not.toMatch(/sandbox/iu);
      expect(result.exit).toStrictEqual({ code: 0, signal: null });
    });
  });

  describe.skipIf(deb === '')('deb', () => {
    let extracted = '';
    let root = '';

    beforeAll(() => {
      extracted = tempDir('deb');
      root = extractDebMember(deb, 'data.tar', extracted);
    });

    afterAll(() => {
      rmSync(extracted, { recursive: true, force: true });
    });

    it('starts sandboxed from the extracted package and exits cleanly on SIGTERM', async () => {
      const result = await smoke(join(root, INSTALL_PREFIX, 'tinydiff'), dirs);
      expect(result.browserArgs).not.toContain('--no-sandbox');
      expect(result.stderr).not.toMatch(/sandbox/iu);
      expect(result.exit).toStrictEqual({ code: 0, signal: null });
    });
  });
});
