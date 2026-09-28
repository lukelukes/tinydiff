import { spawnSync } from 'node:child_process';
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

const malformedPayloads = `
const native = require(process.env.TD_ADDON);
const cyclic = {};
cyclic.self = cyclic;
const deep = '['.repeat(100000) + ']'.repeat(100000);
const calls = [
  () => native.getFileDiff('.', 'a.ts', cyclic),
  () => native.getGitFileContents('.', 'a.ts', cyclic),
  () => native.readFile(cyclic, 'a.ts'),
  () => native.saveComment('.', cyclic, null),
  () => native.readFile(deep, 'a.ts'),
  () => native.saveComment('.', deep, null)
];
Promise.allSettled(calls.map(async (call) => call())).then((results) => {
  const outcomes = results.map((result) =>
    result.status === 'rejected' ? 'thrown' : result.value.error.type
  );
  process.stdout.write(JSON.stringify(outcomes));
});
`;

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

  it('rejects cyclic and deeply nested payloads without terminating the host', () => {
    const child = spawnSync(process.execPath, ['-e', malformedPayloads], {
      env: { ...process.env, TD_ADDON: addonPath },
      encoding: 'utf8'
    });
    expect({ signal: child.signal, status: child.status }).toStrictEqual({
      signal: null,
      status: 0
    });
    expect(JSON.parse(child.stdout)).toStrictEqual([
      'thrown',
      'thrown',
      'thrown',
      'thrown',
      'invalid',
      'invalid'
    ]);
  });

  it('refuses to read files outside file comparison mode', async () => {
    await expect(
      native.readFile(JSON.stringify({ type: 'empty' }), '/etc/hosts')
    ).resolves.toMatchObject({
      status: 'error',
      error: { type: 'path', path: '/etc/hosts' }
    });
  });

  it('keeps integer timestamps as numbers across a round-trip', async () => {
    await expect(native.saveComment(repoDir, JSON.stringify(comment), null)).resolves.toStrictEqual(
      {
        status: 'ok',
        data: null
      }
    );
    const loaded = await native.loadComments(repoDir);
    expect(loaded).toStrictEqual({ status: 'ok', data: { comments: [comment] } });
    expect(JSON.stringify(loaded)).toContain('"createdAt":1700000000');
  });
});
