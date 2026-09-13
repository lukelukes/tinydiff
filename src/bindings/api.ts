import type {
  AppMode,
  Comment,
  CommandError,
  CommentCollection,
  DiffTarget,
  FileDiff,
  GitFileContents,
  GitStatus,
  ReadFileResult,
  Result
} from './types';

export interface TinydiffApi {
  getAppMode: () => Promise<AppMode>;
  getGitStatus: (path: string) => Promise<Result<GitStatus, CommandError>>;
  getFileDiff: (
    repoPath: string,
    filePath: string,
    target: DiffTarget
  ) => Promise<Result<FileDiff, CommandError>>;
  getGitFileContents: (
    repoPath: string,
    filePath: string,
    target: DiffTarget
  ) => Promise<Result<GitFileContents, CommandError>>;
  readFile: (filePath: string) => Promise<Result<ReadFileResult, CommandError>>;
  loadComments: (repoPath: string) => Promise<Result<CommentCollection, CommandError>>;
  saveComment: (
    repoPath: string,
    comment: Comment,
    fileContents: string | null
  ) => Promise<Result<null, CommandError>>;
  deleteComment: (repoPath: string, commentId: string) => Promise<Result<boolean, CommandError>>;
  getCommentsForFile: (
    repoPath: string,
    filePath: string,
    fileContents: string
  ) => Promise<Result<Comment[], CommandError>>;
  settingsGet: (key: string) => Promise<unknown>;
  settingsSet: (key: string, value: unknown) => Promise<void>;
}

declare global {
  interface Window {
    tinydiff: TinydiffApi;
  }
}
