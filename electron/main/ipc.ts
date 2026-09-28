import { nativeTheme } from 'electron';

import type { NativeAddon, TinydiffApi } from '../../src/bindings/api';
import type { AppMode } from '../../src/bindings/types';
import { channel } from './contract';
import type { SettingsStore } from './settings';
import { withinRenderer } from './urls';

export function createHandlers(
  native: NativeAddon,
  appMode: AppMode,
  settings: SettingsStore
): TinydiffApi {
  const modeJson = JSON.stringify(appMode);
  return {
    getAppMode: () => Promise.resolve(appMode),
    getGitStatus: native.getGitStatus,
    getFileDiff: native.getFileDiff,
    getGitFileContents: native.getGitFileContents,
    readFile: (filePath) => native.readFile(modeJson, filePath),
    loadComments: native.loadComments,
    saveComment: (repoPath, comment, fileContents) =>
      native.saveComment(repoPath, JSON.stringify(comment), fileContents),
    deleteComment: native.deleteComment,
    getCommentsForFile: native.getCommentsForFile,
    settingsGet: (key) => Promise.resolve(settings.get(key)),
    settingsSet: (key, value) => {
      const result = settings.set(key, value);
      if (key === 'theme' && result.status === 'ok') {
        nativeTheme.themeSource = settings.get('theme');
      }
      return Promise.resolve(result);
    }
  };
}

interface InvokeEvent {
  senderFrame: { url: string } | null;
}

export interface InvokeRegistrar {
  handle: (channel: string, listener: (event: InvokeEvent, ...args: unknown[]) => unknown) => void;
}

export function registerIpc(
  ipc: InvokeRegistrar,
  handlers: Readonly<Record<string, (...args: never[]) => unknown>>,
  rendererUrl: string
): void {
  for (const [method, handler] of Object.entries(handlers)) {
    ipc.handle(channel(method), (event, ...args: unknown[]): unknown => {
      if (!withinRenderer(rendererUrl, event.senderFrame?.url ?? '')) {
        throw new Error(`${channel(method)} rejected: untrusted sender`);
      }
      const result: unknown = Reflect.apply(handler, undefined, args);
      return result;
    });
  }
}
