import type {
  Comment,
  CommandError,
  FileEntry,
  FileEntryKind,
  GitFileContents,
  GitStatus,
  Result,
  TinydiffApi
} from '#bindings/index';

type FakeResult<T> = Result<T, CommandError>;

export interface FakeTinydiff extends TinydiffApi {
  gitStatus: FakeResult<GitStatus> | null;
  gitFileContents: Map<string, FakeResult<GitFileContents>>;
  comments: Comment[];
  settings: Map<string, unknown>;
  openedUrls: string[];
}

function ok<T>(data: T): FakeResult<T> {
  return { status: 'ok', data };
}

function fail<T>(error: CommandError): FakeResult<T> {
  return { status: 'error', error };
}

export function createFakeTinydiff(): FakeTinydiff {
  const fake: FakeTinydiff = {
    gitStatus: null,
    gitFileContents: new Map(),
    comments: [],
    settings: new Map(),
    openedUrls: [],

    getAppMode() {
      return Promise.resolve({ type: 'empty' });
    },
    getGitStatus() {
      return Promise.resolve(
        fake.gitStatus ?? fail({ type: 'git', path: '', message: 'not configured' })
      );
    },
    getFileDiff(_repoPath, filePath) {
      return Promise.resolve(fail({ type: 'path', path: filePath, message: 'not found' }));
    },
    getGitFileContents(_repoPath, filePath) {
      return Promise.resolve(
        fake.gitFileContents.get(filePath) ??
          fail({ type: 'path', path: filePath, message: 'not found' })
      );
    },
    readFile(filePath) {
      return Promise.resolve(fail({ type: 'path', path: filePath, message: 'not found' }));
    },
    loadComments() {
      return Promise.resolve(ok({ comments: [...fake.comments] }));
    },
    saveComment(_repoPath, comment) {
      const index = fake.comments.findIndex((c) => c.id === comment.id);
      if (index >= 0) {
        fake.comments[index] = comment;
      } else {
        fake.comments.push(comment);
      }
      return Promise.resolve(ok(null));
    },
    deleteComment(_repoPath, commentId) {
      const before = fake.comments.length;
      fake.comments = fake.comments.filter((c) => c.id !== commentId);
      return Promise.resolve(ok(fake.comments.length !== before));
    },
    getCommentsForFile(_repoPath, filePath) {
      return Promise.resolve(ok(fake.comments.filter((c) => c.filePath === filePath)));
    },
    settingsGet(key) {
      return Promise.resolve(fake.settings.get(key) ?? null);
    },
    settingsSet(key, value) {
      fake.settings.set(key, value);
      return Promise.resolve({ status: 'ok', data: null });
    },
    openExternal(url) {
      fake.openedUrls.push(url);
      return Promise.resolve(true);
    }
  };
  return fake;
}

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
  status: Exclude<FileEntryKind['status'], 'renamed'> = 'modified'
): FileEntry {
  return { path, kind: { status } };
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
