import { contextBridge, ipcRenderer } from 'electron';

import type { TinydiffApi } from '../../src/bindings/api';
import { channels } from '../main/contract';

const api: TinydiffApi = {
  getAppMode: () => ipcRenderer.invoke(channels.getAppMode),
  getGitStatus: (path) => ipcRenderer.invoke(channels.getGitStatus, path),
  getFileDiff: (repoPath, filePath, target) =>
    ipcRenderer.invoke(channels.getFileDiff, repoPath, filePath, target),
  getGitFileContents: (repoPath, filePath, target) =>
    ipcRenderer.invoke(channels.getGitFileContents, repoPath, filePath, target),
  readFile: (filePath) => ipcRenderer.invoke(channels.readFile, filePath),
  loadComments: (repoPath) => ipcRenderer.invoke(channels.loadComments, repoPath),
  saveComment: (repoPath, comment, fileContents) =>
    ipcRenderer.invoke(channels.saveComment, repoPath, comment, fileContents),
  deleteComment: (repoPath, commentId) =>
    ipcRenderer.invoke(channels.deleteComment, repoPath, commentId),
  getCommentsForFile: (repoPath, filePath, fileContents) =>
    ipcRenderer.invoke(channels.getCommentsForFile, repoPath, filePath, fileContents),
  settingsGet: (key) => ipcRenderer.invoke(channels.settingsGet, key),
  settingsSet: (key, value) => ipcRenderer.invoke(channels.settingsSet, key, value),
  openExternal: (url) => ipcRenderer.invoke(channels.openExternal, url)
};

contextBridge.exposeInMainWorld('tinydiff', api);
