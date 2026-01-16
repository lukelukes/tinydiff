// Mock Tauri commands for browser development
// This file provides fake data to test the UI without Tauri

const mockGitStatus = {
  staged: [
    { path: 'src/components/Button.tsx', status: 'modified', oldPath: null },
    { path: 'src/features/auth/login.ts', status: 'added', oldPath: null },
    { path: 'src/utils/helpers.ts', status: 'renamed', oldPath: 'src/utils/utils.ts' },
    { path: 'src/api/client.ts', status: 'deleted', oldPath: null }
  ],
  unstaged: [
    { path: 'src/app.tsx', status: 'modified', oldPath: null },
    { path: 'src/styles/main.css', status: 'modified', oldPath: null },
    { path: 'README.md', status: 'modified', oldPath: null },
    { path: 'package.json', status: 'modified', oldPath: null },
    { path: 'src/hooks/useAuth.ts', status: 'modified', oldPath: null }
  ],
  untracked: [
    { path: 'src/features/dashboard/index.tsx', status: 'untracked', oldPath: null },
    { path: 'src/features/dashboard/Dashboard.tsx', status: 'untracked', oldPath: null },
    { path: 'src/features/dashboard/widgets/Chart.tsx', status: 'untracked', oldPath: null },
    { path: '.env.local', status: 'untracked', oldPath: null }
  ]
};

window.__TAURI_INTERNALS__ = {
  invoke: async (cmd, args) => {
    console.log('[Tauri Mock] invoke:', cmd, args);
    await new Promise((r) => setTimeout(r, 50));

    switch (cmd) {
      case 'get_app_mode':
        return { type: 'git', path: '/home/user/projects/my-app' };
      case 'get_git_status':
        return mockGitStatus;
      case 'get_file_diff':
        return {
          path: args?.filePath || 'unknown',
          oldPath: null,
          hunks: [
            {
              oldStart: 1,
              oldLines: 10,
              newStart: 1,
              newLines: 12,
              header: '@@ -1,10 +1,12 @@',
              lines: [
                {
                  changeType: 'context',
                  content: 'import React from "react";',
                  oldLineNo: 1,
                  newLineNo: 1
                },
                { changeType: 'context', content: '', oldLineNo: 2, newLineNo: 2 },
                {
                  changeType: 'deletion',
                  content: 'const oldImplementation = () => {',
                  oldLineNo: 3,
                  newLineNo: null
                },
                {
                  changeType: 'addition',
                  content: 'const newImplementation = () => {',
                  oldLineNo: null,
                  newLineNo: 3
                },
                {
                  changeType: 'addition',
                  content: '  // Better performance',
                  oldLineNo: null,
                  newLineNo: 4
                },
                { changeType: 'context', content: '  return null;', oldLineNo: 4, newLineNo: 5 },
                { changeType: 'context', content: '};', oldLineNo: 5, newLineNo: 6 }
              ]
            }
          ],
          isBinary: false
        };
      case 'get_git_file_contents':
        return {
          oldFile: { name: 'old.ts', contents: 'const old = true;', lang: 'typescript' },
          newFile: { name: 'new.ts', contents: 'const new = true;', lang: 'typescript' },
          isBinary: false
        };
      case 'read_file':
        return {
          name: args?.filePath || 'file.ts',
          contents: '// File contents here',
          lang: 'typescript',
          isBinary: false
        };
      default:
        console.warn('[Tauri Mock] Unknown command:', cmd);
        throw new Error(`Unknown command: ${cmd}`);
    }
  }
};

console.log('[Tauri Mock] Initialized - running in browser dev mode');
