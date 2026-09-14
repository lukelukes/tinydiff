import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Comment } from '#bindings/index';

import type * as Addon from '../crates/tinydiff-napi/index';

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

describe('native addon', () => {
  let native: typeof Addon;
  let repoDir: string;

  beforeAll(() => {
    native = loadAddon();
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
