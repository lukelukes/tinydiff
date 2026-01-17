import type { CommandError, GitFileContents, GitStatus, Result } from '#tauri-bindings/index';

type FakeResult<T> = Result<T, CommandError>;

export function createFakeTauri() {
  return {
    gitStatus: null as FakeResult<GitStatus> | null,
    gitFileContents: new Map<string, FakeResult<GitFileContents>>(),

    getGitStatus(_path: string): FakeResult<GitStatus> {
      if (this.gitStatus) return this.gitStatus;
      return { status: 'error', error: { type: 'git', path: '', message: 'not configured' } };
    },

    getGitFileContents(
      _repoPath: string,
      filePath: string,
      _target: string
    ): FakeResult<GitFileContents> {
      const result = this.gitFileContents.get(filePath);
      if (result) return result;
      return { status: 'error', error: { type: 'path', path: filePath, message: 'not found' } };
    }
  };
}

export type FakeTauri = ReturnType<typeof createFakeTauri>;

export function createMockGitStatus(overrides: Partial<GitStatus> = {}): GitStatus {
  return {
    staged: [],
    unstaged: [],
    untracked: [],
    ...overrides
  };
}

export function createMockFileEntry(
  path: string,
  status: 'added' | 'modified' | 'deleted' = 'modified'
) {
  return { path, status, oldPath: null };
}

export function createMockGitFileContents(
  oldContent: string | null,
  newContent: string | null
): GitFileContents {
  return {
    oldFile: {
      name: 'file.ts',
      lang: 'typescript',
      content: oldContent === null ? null : { type: 'text', contents: oldContent }
    },
    newFile: {
      name: 'file.ts',
      lang: 'typescript',
      content: newContent === null ? null : { type: 'text', contents: newContent }
    }
  };
}

export function createBinaryFileContents(size: number): GitFileContents {
  return {
    oldFile: {
      name: 'file.bin',
      lang: null,
      content: { type: 'binary', size }
    },
    newFile: {
      name: 'file.bin',
      lang: null,
      content: { type: 'binary', size }
    }
  };
}
