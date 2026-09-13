import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { commands, type Comment } from '#bindings/index';

import type * as Addon from '../../crates/tinydiff-napi/index';
import {
  createBinaryFileContents,
  createFakeTinydiff,
  createMockFileEntry,
  createMockGitFileContents,
  createMockGitStatus,
  type FakeTinydiff
} from './fake-tinydiff';

const comment: Comment = {
  id: 'c1',
  filePath: 'src/a.ts',
  anchor: { type: 'pinned', line: 3 },
  body: 'looks good',
  resolved: false,
  createdAt: 1_700_000_000,
  updatedAt: 1_700_000_000
};

describe('commands over window.tinydiff', () => {
  let fake: FakeTinydiff;

  beforeEach(() => {
    fake = createFakeTinydiff();
    vi.stubGlobal('window', { tinydiff: fake });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('passes ok envelopes through untouched', async () => {
    const status = createMockGitStatus({ unstaged: [createMockFileEntry('src/a.ts')] });
    fake.gitStatus = { status: 'ok', data: status };

    await expect(commands.getGitStatus('/repo')).resolves.toStrictEqual({
      status: 'ok',
      data: status
    });
  });

  it('passes error envelopes through untouched', async () => {
    await expect(
      commands.getGitFileContents('/repo', 'missing.ts', 'unstaged')
    ).resolves.toStrictEqual({
      status: 'error',
      error: { type: 'path', path: 'missing.ts', message: 'not found' }
    });
  });

  it('serves configured file contents', async () => {
    fake.gitFileContents.set('src/a.ts', {
      status: 'ok',
      data: createMockGitFileContents('a', 'b')
    });
    fake.gitFileContents.set('logo.png', { status: 'ok', data: createBinaryFileContents(12) });

    await expect(commands.getGitFileContents('/repo', 'src/a.ts', 'staged')).resolves.toStrictEqual(
      {
        status: 'ok',
        data: createMockGitFileContents('a', 'b')
      }
    );
    await expect(commands.getGitFileContents('/repo', 'logo.png', 'staged')).resolves.toStrictEqual(
      {
        status: 'ok',
        data: createBinaryFileContents(12)
      }
    );
  });

  it('round-trips comments through save, load and delete', async () => {
    await expect(commands.saveComment('/repo', comment, null)).resolves.toStrictEqual({
      status: 'ok',
      data: null
    });
    await expect(commands.loadComments('/repo')).resolves.toStrictEqual({
      status: 'ok',
      data: { comments: [comment] }
    });
    await expect(commands.deleteComment('/repo', 'c1')).resolves.toStrictEqual({
      status: 'ok',
      data: true
    });
    await expect(commands.getCommentsForFile('/repo', 'src/a.ts', '')).resolves.toStrictEqual({
      status: 'ok',
      data: []
    });
  });
});

const addonPath = resolve(import.meta.dirname, '../../crates/tinydiff-napi/tinydiff.node');

function isAddon(value: unknown): value is typeof Addon {
  return typeof value === 'object' && value !== null && 'resolveAppMode' in value;
}

function loadAddon(): typeof Addon {
  const load: (id: string) => unknown = createRequire(import.meta.url);
  const addon = load(addonPath);
  if (!isAddon(addon)) {
    throw new Error(`${addonPath} does not export the tinydiff addon`);
  }
  return addon;
}

describe.skipIf(!existsSync(addonPath))('native addon', () => {
  const native = loadAddon();
  const repoDir = mkdtempSync(join(tmpdir(), 'tinydiff-fake-'));

  afterAll(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('resolves an empty argument list to empty mode', () => {
    expect(native.resolveAppMode([])).toStrictEqual({ status: 'ok', data: { type: 'empty' } });
  });

  it('reports a missing path as a path error', () => {
    expect(native.resolveAppMode(['/nonexistent/tinydiff'])).toMatchObject({
      status: 'error',
      error: { type: 'path', path: '/nonexistent/tinydiff' }
    });
  });

  it('keeps integer timestamps as numbers across a round-trip', async () => {
    await expect(native.saveComment(repoDir, comment, null)).resolves.toStrictEqual({
      status: 'ok',
      data: null
    });
    const loaded = await native.loadComments(repoDir);
    expect(loaded).toStrictEqual({ status: 'ok', data: { comments: [comment] } });
    expect(JSON.stringify(loaded)).toContain('"createdAt":1700000000');
  });
});
