import { nativeTheme } from 'electron';

import type { AppMode } from '../../src/bindings/types';
import { openExternal } from './external';
import type { Handlers } from './ipc';
import { registerIpc } from './ipc';
import { native } from './native';
import { getSetting, setSetting } from './settings';

export function applyTheme(value: unknown): void {
  nativeTheme.themeSource = value === 'light' ? 'light' : 'dark';
}

function createHandlers(appMode: AppMode): Handlers {
  const allowedFiles = appMode.type === 'file' ? [appMode.fileA, appMode.fileB] : [];

  return {
    getAppMode: () => Promise.resolve(appMode),
    getGitStatus: (path) => native.getGitStatus(path),
    getFileDiff: (repoPath, filePath, target) => native.getFileDiff(repoPath, filePath, target),
    getGitFileContents: (repoPath, filePath, target) =>
      native.getGitFileContents(repoPath, filePath, target),
    readFile: (filePath) => native.readFile(filePath, allowedFiles),
    loadComments: (repoPath) => native.loadComments(repoPath),
    saveComment: (repoPath, comment, fileContents) =>
      native.saveComment(repoPath, comment, fileContents),
    deleteComment: (repoPath, commentId) => native.deleteComment(repoPath, commentId),
    getCommentsForFile: (repoPath, filePath, fileContents) =>
      native.getCommentsForFile(repoPath, filePath, fileContents),
    settingsGet: (key) => Promise.resolve(getSetting(key)),
    settingsSet: (key, value) => {
      const result = setSetting(key, value);
      applyTheme(getSetting('theme'));
      return result;
    },
    openExternal: (url) => openExternal(url)
  };
}

export function registerHandlers(appMode: AppMode): void {
  registerIpc(createHandlers(appMode));
}
