import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import type { Rectangle } from 'electron';
import type { ElectronApplication, Page } from 'playwright';
import { _electron as electron } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { TinydiffApi } from '#bindings/index';

declare global {
  interface Window {
    tinydiff: TinydiffApi;
  }
  var openedExternally: string[] | undefined;
}

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

const EXTERNAL_URL = 'http://open-external.invalid/';
const REJECTED_URLS = ['file:///etc/passwd', 'javascript:alert(1)'];

const OFFSCREEN_BOUNDS = { x: 0, y: -600, width: 900, height: 700 };

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

function launch(repoDir: string, configDir: string): Promise<ElectronApplication> {
  const executablePath = process.env.TD_E2E_BINARY;
  return electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: executablePath ? [repoDir] : [resolve('out/main/index.js'), repoDir],
    chromiumSandbox: true,
    env: { ...definedEnv(), XDG_CONFIG_HOME: configDir }
  });
}

function windowBounds(target: ElectronApplication): Promise<Rectangle | null> {
  return target.evaluate(
    ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getNormalBounds() ?? null
  );
}

function isInside(bounds: Rectangle | null, area: Rectangle): boolean {
  return (
    bounds !== null &&
    bounds.x >= area.x &&
    bounds.y >= area.y &&
    bounds.x + bounds.width <= area.x + area.width &&
    bounds.y + bounds.height <= area.y + area.height
  );
}

function workArea(target: ElectronApplication): Promise<Rectangle> {
  return target.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
}

function stubOpenExternal(target: ElectronApplication): Promise<void> {
  return target.evaluate(({ shell }) => {
    globalThis.openedExternally = [];
    shell.openExternal = (url) => {
      globalThis.openedExternally?.push(url);
      return Promise.resolve();
    };
  });
}

function openedExternally(target: ElectronApplication): Promise<string[]> {
  return target.evaluate(() => globalThis.openedExternally ?? []);
}

function clickBlankAnchor(target: Page, href: string): Promise<void> {
  return target.evaluate((url) => {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  }, href);
}

describe('tinydiff electron app', () => {
  let repoDir: string;
  let configDir: string;
  let app: ElectronApplication;
  let page: Page;
  let closed = false;

  beforeAll(async () => {
    repoDir = createRepo();
    configDir = mkdtempSync(join(tmpdir(), 'tinydiff-e2e-config-'));
    app = await launch(repoDir, configDir);
    await stubOpenExternal(app);
    page = await app.firstWindow();
  });

  afterAll(async () => {
    if (!closed) {
      await app.close();
    }
    rmSync(repoDir, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
  });

  it('exposes only the typed bridge to the renderer', async () => {
    await expect(page.evaluate(() => typeof window.tinydiff.getGitStatus)).resolves.toBe(
      'function'
    );
    await expect(page.evaluate(() => typeof globalThis.require)).resolves.toBe('undefined');
    await expect(page.evaluate(() => typeof globalThis.process)).resolves.toBe('undefined');
    await expect(page.evaluate(() => typeof globalThis.Buffer)).resolves.toBe('undefined');
  });

  it('runs with the chromium sandbox enabled', async () => {
    await expect(
      app.evaluate(({ app: electronApp }) => electronApp.commandLine.hasSwitch('no-sandbox'))
    ).resolves.toBe(false);
  });

  it('opens http urls through the shell from the api and from blank anchors', async () => {
    const url = page.url();
    await expect(
      page.evaluate((target) => window.tinydiff.openExternal(target), EXTERNAL_URL)
    ).resolves.toBe(true);
    await expect.poll(() => openedExternally(app)).toStrictEqual([EXTERNAL_URL]);

    await clickBlankAnchor(page, EXTERNAL_URL);
    await expect.poll(() => openedExternally(app)).toStrictEqual([EXTERNAL_URL, EXTERNAL_URL]);

    expect(page.url()).toBe(url);
    expect(app.windows()).toHaveLength(1);
  });

  it('refuses to open non-http urls externally', async () => {
    const before = await openedExternally(app);
    const results = await Promise.all(
      REJECTED_URLS.map((rejected) =>
        page.evaluate((target) => window.tinydiff.openExternal(target), rejected)
      )
    );
    expect(results).toStrictEqual(REJECTED_URLS.map(() => false));
    await Promise.all(REJECTED_URLS.map((rejected) => clickBlankAnchor(page, rejected)));
    await expect(openedExternally(app)).resolves.toStrictEqual(before);
    expect(app.windows()).toHaveLength(1);
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

  it('rejects settings outside the allowlist and persists valid ones', async () => {
    await expect(
      page.evaluate(() => {
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;
        return window.tinydiff.settingsSet('theme', cyclic);
      })
    ).resolves.toMatchObject({ status: 'error', error: { type: 'settings' } });
    await expect(
      page.evaluate(() => window.tinydiff.settingsSet('viewMode', 'sideways'))
    ).resolves.toMatchObject({ status: 'error', error: { type: 'settings' } });
    await expect(
      page.evaluate(() => window.tinydiff.settingsSet('fontSize', 12))
    ).resolves.toMatchObject({ status: 'error', error: { type: 'settings' } });

    await expect(
      page.evaluate(() => window.tinydiff.settingsSet('viewMode', 'unified'))
    ).resolves.toStrictEqual({ status: 'ok', data: null });
    await expect(page.evaluate(() => window.tinydiff.settingsGet('viewMode'))).resolves.toBe(
      'unified'
    );
    await expect(page.evaluate(() => window.tinydiff.settingsGet('theme'))).resolves.toBe('dark');

    const settingsFile = join(configDir, 'tinydiff', 'settings.json');
    expect(JSON.parse(readFileSync(settingsFile, 'utf8'))).toStrictEqual({
      theme: 'dark',
      viewMode: 'unified'
    });
  });

  it('saves the window bounds on close and clamps restored bounds into the work area', async () => {
    const bounds = await windowBounds(app);
    await app.close();
    closed = true;

    const stateFile = join(configDir, 'tinydiff', 'window-state.json');
    expect(JSON.parse(readFileSync(stateFile, 'utf8'))).toStrictEqual({
      bounds,
      maximized: false
    });

    writeFileSync(stateFile, JSON.stringify({ bounds: OFFSCREEN_BOUNDS, maximized: false }));
    const restarted = await launch(repoDir, configDir);
    try {
      await restarted.firstWindow();
      const area = await workArea(restarted);
      const expected = {
        width: Math.min(OFFSCREEN_BOUNDS.width, area.width),
        height: Math.min(OFFSCREEN_BOUNDS.height, area.height)
      };
      await expect.poll(() => windowBounds(restarted), { timeout: 5000 }).toMatchObject(expected);
      expect(isInside(await windowBounds(restarted), area)).toBe(true);
    } finally {
      await restarted.close();
    }
  });
});
