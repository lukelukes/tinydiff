import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { commands, type Comment } from '#bindings/index';

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
