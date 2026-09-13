import type {
  Comment,
  CommandError,
  CommentCollection,
  FileDiff,
  GitFileContents,
  Result,
  TinydiffApi
} from '#bindings/index';

import { binaryFiles, fileContentsMap } from './fixtures/file-contents';
import { mockGitStatus } from './fixtures/git-status';

const MOCK_REPO_PATH = '/home/user/projects/my-app';

const SETTINGS_KEY = 'tinydiff-shim-settings';

const now = Math.floor(Date.now() / 1000);

const commentsData: CommentCollection = {
  comments: [
    {
      id: 'comment-1',
      filePath: 'src/features/diff-viewer/diff-viewer.tsx',
      anchor: { type: 'pinned', line: 45 },
      body: 'Consider memoizing this function to avoid recalculation on each render.',
      resolved: false,
      createdAt: now - 3600,
      updatedAt: now - 3600
    },
    {
      id: 'comment-2',
      filePath: 'src/features/diff-viewer/diff-viewer.tsx',
      anchor: { type: 'pinned', line: 112 },
      body: 'This timeout value should probably be configurable.',
      resolved: true,
      createdAt: now - 7200,
      updatedAt: now - 1800
    },
    {
      id: 'comment-3',
      filePath: 'src-tauri/src/comments.rs',
      anchor: { type: 'pinned', line: 28 },
      body: 'Nice use of the builder pattern here!',
      resolved: false,
      createdAt: now - 86400,
      updatedAt: now - 86400
    }
  ]
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function ok<T>(data: T): Result<T, CommandError> {
  return { status: 'ok', data };
}

function fail<T>(error: CommandError): Result<T, CommandError> {
  return { status: 'error', error };
}

function lookupContents(filePath: string): GitFileContents | undefined {
  return fileContentsMap[filePath] ?? binaryFiles[filePath];
}

function notFound(filePath: string): CommandError {
  return { type: 'path', path: filePath, message: 'File not found in fixtures' };
}

function readSettings(): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function createShim(): TinydiffApi {
  return {
    getAppMode() {
      return Promise.resolve({ type: 'git', path: MOCK_REPO_PATH });
    },
    async getGitStatus() {
      await delay(100);
      return ok(mockGitStatus);
    },
    async getFileDiff(_repoPath, filePath) {
      await delay(50);
      const contents = lookupContents(filePath);
      if (!contents) {
        return fail(notFound(filePath));
      }
      const isBinary =
        contents.oldFile.content?.type === 'binary' || contents.newFile.content?.type === 'binary';
      const diff: FileDiff = {
        path: filePath,
        oldPath: null,
        content: isBinary ? { contentType: 'binary' } : { contentType: 'text', hunks: [] }
      };
      return ok(diff);
    },
    async getGitFileContents(_repoPath, filePath) {
      await delay(80);
      const contents = lookupContents(filePath);
      return contents ? ok(contents) : fail(notFound(filePath));
    },
    readFile(filePath) {
      return Promise.resolve(
        ok({ name: filePath, contents: '', lang: 'typescript', isBinary: false })
      );
    },
    async loadComments() {
      await delay(30);
      return ok({ comments: [...commentsData.comments] });
    },
    async saveComment(_repoPath, comment: Comment) {
      await delay(50);
      const index = commentsData.comments.findIndex((c) => c.id === comment.id);
      if (index >= 0) {
        commentsData.comments[index] = comment;
      } else {
        commentsData.comments.push(comment);
      }
      return ok(null);
    },
    async deleteComment(_repoPath, commentId) {
      await delay(30);
      const index = commentsData.comments.findIndex((c) => c.id === commentId);
      if (index >= 0) {
        commentsData.comments.splice(index, 1);
        return ok(true);
      }
      return ok(false);
    },
    async getCommentsForFile(_repoPath, filePath) {
      await delay(30);
      return ok(commentsData.comments.filter((c) => c.filePath === filePath));
    },
    settingsGet(key) {
      return Promise.resolve(readSettings()[key] ?? null);
    },
    settingsSet(key, value) {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...readSettings(), [key]: value }));
      return Promise.resolve();
    }
  };
}

function hasBridge(target: object): boolean {
  return 'tinydiff' in target;
}

if (!hasBridge(window)) {
  window.tinydiff = createShim();
  console.log('[tinydiff shim] serving fixtures:', Object.keys(fileContentsMap));
}
