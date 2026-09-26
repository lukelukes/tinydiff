import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import type { Rectangle } from 'electron';
import type { ElectronApplication, Page } from 'playwright';
import { _electron as electron } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const FILE_NAME = 'greeter.ts';

const ORIGINAL = `export function greet(name: string): string {
  return \`hello \${name}\`;
}
`;

const MODIFIED = `export function greet(name: string, excited = false): string {
  const punctuation = excited ? '!' : '.';
  return \`hello \${name}\${punctuation}\`;
}
`;

const COMMENT_BODY = 'Consider defaulting excited to true';

const RESTORED_BOUNDS = { x: 40, y: 50, width: 900, height: 640 };
const STATE_SAVE_SETTLE_MS = 1000;

function definedEnv(): Record<string, string> {
  const entries = Object.entries(process.env).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string'
  );
  return Object.fromEntries(entries);
}

function git(cwd: string, args: string[]): void {
  execFileSync('git', ['-c', 'user.name=e2e', '-c', 'user.email=e2e@example.com', ...args], {
    cwd,
    stdio: 'ignore'
  });
}

function createRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tinydiff-e2e-repo-'));
  git(dir, ['init', '-q']);
  writeFileSync(join(dir, FILE_NAME), ORIGINAL);
  git(dir, ['add', FILE_NAME]);
  git(dir, ['commit', '-q', '-m', 'initial']);
  writeFileSync(join(dir, FILE_NAME), MODIFIED);
  return dir;
}

function launch(repoDir: string, userDataDir: string): Promise<ElectronApplication> {
  const executablePath = process.env.TD_E2E_BINARY;
  const appArgs = [`--user-data-dir=${userDataDir}`, repoDir];
  return electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: executablePath ? appArgs : [resolve('out/main/index.js'), ...appArgs],
    chromiumSandbox: true,
    env: definedEnv()
  });
}

async function withApp<T>(
  repoDir: string,
  userDataDir: string,
  run: (target: ElectronApplication) => Promise<T>
): Promise<T> {
  const target = await launch(repoDir, userDataDir);
  try {
    return await run(target);
  } finally {
    await target.close();
  }
}

interface WindowState {
  bounds: Rectangle;
  maximized: boolean;
}

async function windowState(target: ElectronApplication): Promise<WindowState> {
  await target.firstWindow();
  return target.evaluate(({ BrowserWindow }) => {
    const [win] = BrowserWindow.getAllWindows();
    if (win === undefined) {
      throw new Error('no window');
    }
    return { bounds: win.getNormalBounds(), maximized: win.isMaximized() };
  });
}

describe('tinydiff electron app', () => {
  let repoDir: string;
  let userDataDir: string;
  let app: ElectronApplication;
  let page: Page;

  beforeAll(async () => {
    repoDir = createRepo();
    userDataDir = mkdtempSync(join(tmpdir(), 'tinydiff-e2e-user-data-'));
    app = await launch(repoDir, userDataDir);
    page = await app.firstWindow();
  });

  afterAll(async () => {
    await app.close();
    rmSync(repoDir, { recursive: true, force: true });
    rmSync(userDataDir, { recursive: true, force: true });
  });

  it('exposes only the typed bridge to the renderer', async () => {
    await expect(page.evaluate(() => typeof window.tinydiff.getGitStatus)).resolves.toBe(
      'function'
    );
    await expect(page.evaluate(() => typeof globalThis.require)).resolves.toBe('undefined');
    await expect(page.evaluate(() => typeof globalThis.process)).resolves.toBe('undefined');
    await expect(page.evaluate(() => typeof globalThis.Buffer)).resolves.toBe('undefined');
  });

  it('keeps its profile inside the isolated user data directory', async () => {
    await expect(
      app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'))
    ).resolves.toBe(userDataDir);
  });

  it('runs with the chromium sandbox enabled', async () => {
    await expect(
      app.evaluate(({ app: electronApp }) => electronApp.commandLine.hasSwitch('no-sandbox'))
    ).resolves.toBe(false);
  });

  it('lists the modified file in the file tree', async () => {
    const tree = page.getByRole('list', { name: 'Changed files' });
    const entry = tree.getByText(FILE_NAME);
    await entry.waitFor({ state: 'visible' });
    await expect(entry.count()).resolves.toBe(1);
  });

  it('renders a syntax-highlighted diff after selecting the file', async () => {
    await page.getByRole('list', { name: 'Changed files' }).getByText(FILE_NAME).click();
    const token = page.locator('diffs-container span[style*="--diffs-token"]', {
      hasText: 'punctuation'
    });
    await token.first().waitFor({ state: 'visible' });
    await expect(token.count()).resolves.toBeGreaterThan(0);
  });

  it('persists a comment across a reload', async () => {
    const line = page
      .locator('diffs-container [data-line-type="change-addition"]', { hasText: 'punctuation' })
      .first();
    await line.hover();
    await page.getByRole('button', { name: 'Add comment' }).click({ force: true });
    await page.getByPlaceholder('Leave a comment...').fill(COMMENT_BODY);
    await page.getByRole('button', { name: 'Comment', exact: true }).click();
    await page.getByText(COMMENT_BODY).waitFor({ state: 'visible' });

    await page.reload();
    await page.getByRole('list', { name: 'Changed files' }).getByText(FILE_NAME).click();
    await page.getByText(COMMENT_BODY).waitFor({ state: 'visible' });

    const commentsFile = join(repoDir, '.tinydiff', 'comments.json');
    expect(existsSync(commentsFile)).toBe(true);
    expect(readFileSync(commentsFile, 'utf8')).toContain(COMMENT_BODY);
  });

  it('survives cyclic native payloads sent from the renderer', async () => {
    const cyclicCalls = [
      "(() => { const cyclic = {}; cyclic.self = cyclic; return window.tinydiff.getFileDiff('.', 'a.ts', cyclic).then(() => 'resolved', () => 'rejected'); })()",
      "(() => { const cyclic = {}; cyclic.self = cyclic; return window.tinydiff.saveComment('.', cyclic, null).then(() => 'resolved', () => 'rejected'); })()"
    ];
    const outcomes = await Promise.all(
      cyclicCalls.map((call): Promise<unknown> => page.evaluate(call))
    );
    expect(outcomes).toStrictEqual(['rejected', 'rejected']);
    await expect(
      page.evaluate((path) => window.tinydiff.getGitStatus(path), repoDir)
    ).resolves.toMatchObject({ status: 'ok' });
  });

  it('rejects settings outside the allowlist and persists valid ones', async () => {
    const untypedCalls = [
      "(() => { const cyclic = {}; cyclic.self = cyclic; return window.tinydiff.settingsSet('theme', cyclic); })()",
      "window.tinydiff.settingsSet('viewMode', 'sideways')",
      "window.tinydiff.settingsSet('fontSize', 12)"
    ];
    const rejections = await Promise.all(
      untypedCalls.map((call): Promise<unknown> => page.evaluate(call))
    );
    const settingsError = { status: 'error', error: { type: 'settings' } };
    expect(rejections).toMatchObject([settingsError, settingsError, settingsError]);

    await expect(
      page.evaluate(() => window.tinydiff.settingsSet('viewMode', 'unified'))
    ).resolves.toStrictEqual({ status: 'ok', data: null });
    await expect(page.evaluate(() => window.tinydiff.settingsGet('viewMode'))).resolves.toBe(
      'unified'
    );
    await expect(page.evaluate(() => window.tinydiff.settingsGet('theme'))).resolves.toBe('dark');

    const settingsFile = join(userDataDir, 'settings.json');
    expect(JSON.parse(readFileSync(settingsFile, 'utf8'))).toStrictEqual({
      theme: 'dark',
      viewMode: 'unified'
    });
  });
});

describe('tinydiff window state', () => {
  let repoDir: string;
  let userDataDir: string;

  beforeAll(() => {
    repoDir = createRepo();
    userDataDir = mkdtempSync(join(tmpdir(), 'tinydiff-e2e-window-state-'));
  });

  afterAll(() => {
    rmSync(repoDir, { recursive: true, force: true });
    rmSync(userDataDir, { recursive: true, force: true });
  });

  it('restores the bounds and maximized state of the previous launch', async () => {
    const saved = await withApp(repoDir, userDataDir, async (first) => {
      await windowState(first);
      await first.evaluate(({ BrowserWindow }, bounds) => {
        BrowserWindow.getAllWindows()[0]?.setBounds(bounds);
      }, RESTORED_BOUNDS);
      await expect
        .poll(async () => (await windowState(first)).bounds)
        .toMatchObject({ width: RESTORED_BOUNDS.width, height: RESTORED_BOUNDS.height });
      await first.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.maximize();
      });
      await expect.poll(async () => (await windowState(first)).maximized).toBe(true);
      await sleep(STATE_SAVE_SETTLE_MS);
      return windowState(first);
    });

    await withApp(repoDir, userDataDir, async (second) => {
      await expect.poll(() => windowState(second)).toStrictEqual(saved);
    });
  });
});
