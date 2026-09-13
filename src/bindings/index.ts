import type { TinydiffApi } from './api';
import type { Comment, DiffTarget } from './types';

export type { SettingsError, TinydiffApi } from './api';
export type {
  AppMode,
  Comment,
  CommandError,
  CommentAnchor,
  CommentCollection,
  DiffContent,
  DiffFile,
  DiffHunk,
  DiffLine,
  DiffTarget,
  FileContent,
  FileDiff,
  FileEntry,
  FileEntryKind,
  GitFileContents,
  GitStatus,
  LineChangeType,
  ReadFileResult,
  Result
} from './types';

function bridge(): TinydiffApi {
  return window.tinydiff;
}

export const commands = {
  getAppMode() {
    return bridge().getAppMode();
  },
  getGitStatus(path: string) {
    return bridge().getGitStatus(path);
  },
  getFileDiff(repoPath: string, filePath: string, target: DiffTarget) {
    return bridge().getFileDiff(repoPath, filePath, target);
  },
  getGitFileContents(repoPath: string, filePath: string, target: DiffTarget) {
    return bridge().getGitFileContents(repoPath, filePath, target);
  },
  readFile(filePath: string) {
    return bridge().readFile(filePath);
  },
  loadComments(repoPath: string) {
    return bridge().loadComments(repoPath);
  },
  saveComment(repoPath: string, comment: Comment, fileContents: string | null) {
    return bridge().saveComment(repoPath, comment, fileContents);
  },
  deleteComment(repoPath: string, commentId: string) {
    return bridge().deleteComment(repoPath, commentId);
  },
  getCommentsForFile(repoPath: string, filePath: string, fileContents: string) {
    return bridge().getCommentsForFile(repoPath, filePath, fileContents);
  },
  openExternal(url: string) {
    return bridge().openExternal(url);
  }
};
