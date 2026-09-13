import { nativeTheme } from 'electron';

import type { AppMode } from '../../src/bindings/types';
import { handle } from './ipc';
import { native } from './native';
import { getSetting, setSetting } from './settings';

export function applyTheme(value: unknown): void {
  nativeTheme.themeSource = value === 'light' ? 'light' : 'dark';
}

export function registerHandlers(appMode: AppMode): void {
  const allowedFiles = appMode.type === 'file' ? [appMode.fileA, appMode.fileB] : [];

  handle('getAppMode', () => Promise.resolve(appMode));
  handle('getGitStatus', (path) => native.getGitStatus(path));
  handle('getFileDiff', (repoPath, filePath, target) =>
    native.getFileDiff(repoPath, filePath, target)
  );
  handle('getGitFileContents', (repoPath, filePath, target) =>
    native.getGitFileContents(repoPath, filePath, target)
  );
  handle('readFile', (filePath) => native.readFile(filePath, allowedFiles));
  handle('loadComments', (repoPath) => native.loadComments(repoPath));
  handle('saveComment', (repoPath, comment, fileContents) =>
    native.saveComment(repoPath, comment, fileContents)
  );
  handle('deleteComment', (repoPath, commentId) => native.deleteComment(repoPath, commentId));
  handle('getCommentsForFile', (repoPath, filePath, fileContents) =>
    native.getCommentsForFile(repoPath, filePath, fileContents)
  );
  handle('settingsGet', (key) => {
    if (typeof key !== 'string') {
      throw new TypeError('settings key must be a string');
    }
    return Promise.resolve(getSetting(key));
  });
  handle('settingsSet', (key, value) => {
    if (typeof key !== 'string') {
      throw new TypeError('settings key must be a string');
    }
    setSetting(key, value);
    if (key === 'theme') {
      applyTheme(value);
    }
    return Promise.resolve();
  });
}
