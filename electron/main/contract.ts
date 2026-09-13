import type { TinydiffApi } from '../../src/bindings/api';

export const channels = {
  getAppMode: 'tinydiff:getAppMode',
  getGitStatus: 'tinydiff:getGitStatus',
  getFileDiff: 'tinydiff:getFileDiff',
  getGitFileContents: 'tinydiff:getGitFileContents',
  readFile: 'tinydiff:readFile',
  loadComments: 'tinydiff:loadComments',
  saveComment: 'tinydiff:saveComment',
  deleteComment: 'tinydiff:deleteComment',
  getCommentsForFile: 'tinydiff:getCommentsForFile',
  settingsGet: 'tinydiff:settingsGet',
  settingsSet: 'tinydiff:settingsSet'
} as const satisfies Record<keyof TinydiffApi, string>;
