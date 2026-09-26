import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Comment, NativeAddon } from '#bindings/index';

import { loadAddon } from '../electron/main/addon';

const addonPath = resolve(import.meta.dirname, '../crates/tinydiff-napi/tinydiff.node');

const comment: Comment = {
  id: 'c1',
  filePath: 'src/a.ts',
  anchor: { type: 'pinned', line: 3 },
  body: 'looks good',
  resolved: false,
  createdAt: 1_700_000_000,
  updatedAt: 1_700_000_000
};

describe('native addon', () => {
  let native: NativeAddon;
  let repoDir: string;

  beforeAll(() => {
    native = loadAddon(addonPath);
    repoDir = mkdtempSync(join(tmpdir(), 'tinydiff-native-'));
  });

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

  it('reports undecodable arguments as invalid', async () => {
    await expect(
      Reflect.apply(native.getFileDiff, undefined, [repoDir, 'a.ts', 'sideways'])
    ).resolves.toMatchObject({ status: 'error', error: { type: 'invalid' } });
  });

  it('refuses to read files outside file comparison mode', async () => {
    await expect(native.readFile({ type: 'empty' }, '/etc/hosts')).resolves.toMatchObject({
      status: 'error',
      error: { type: 'path', path: '/etc/hosts' }
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
