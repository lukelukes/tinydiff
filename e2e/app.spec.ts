import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import type { ElectronApplication, Page } from 'playwright';
import { _electron as electron } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { TinydiffApi } from '#bindings/index';

declare global {
  interface Window {
    tinydiff: TinydiffApi;
  }
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

describe('tinydiff electron app', () => {
  let repoDir: string;
  let configDir: string;
  let app: ElectronApplication;
  let page: Page;

  beforeAll(async () => {
    repoDir = createRepo();
    configDir = mkdtempSync(join(tmpdir(), 'tinydiff-e2e-config-'));
    const executablePath = process.env.TD_E2E_BINARY;
    app = await electron.launch({
      ...(executablePath ? { executablePath } : {}),
      args: executablePath ? [repoDir] : [resolve('out/main/index.js'), repoDir],
      env: { ...definedEnv(), XDG_CONFIG_HOME: configDir }
    });
    page = await app.firstWindow();
  });

  afterAll(async () => {
    await app.close();
    rmSync(repoDir, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
  });

  it('exposes only the typed bridge to the renderer', async () => {
    await expect(page.evaluate(() => typeof window.tinydiff.getGitStatus)).resolves.toBe(
      'function'
    );
    await expect(page.evaluate(() => typeof globalThis.require)).resolves.toBe('undefined');
    await expect(page.evaluate(() => typeof globalThis.process)).resolves.toBe('undefined');
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
});
