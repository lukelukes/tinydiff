import type { TinydiffApi } from '../../src/bindings/api';

const exposed: Record<keyof TinydiffApi, true> = {
  getAppMode: true,
  getGitStatus: true,
  getFileDiff: true,
  getGitFileContents: true,
  readFile: true,
  loadComments: true,
  saveComment: true,
  deleteComment: true,
  getCommentsForFile: true,
  settingsGet: true,
  settingsSet: true
};

export const methods = Object.keys(exposed);

export function channel(method: string): string {
  return `tinydiff:${method}`;
}
