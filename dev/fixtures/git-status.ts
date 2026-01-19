import type { GitStatus } from '#tauri-bindings/index';

export const mockGitStatus: GitStatus = {
  staged: [
    { path: 'src/features/diff-viewer/diff-viewer.tsx', status: 'modified', oldPath: null },
    { path: 'src/features/comments/comment-components.tsx', status: 'modified', oldPath: null },
    { path: 'src/lib/settings-store.ts', status: 'added', oldPath: null },
    { path: 'src-tauri/src/comments.rs', status: 'modified', oldPath: null },
    { path: 'src/utils/old-helpers.ts', status: 'renamed', oldPath: 'src/utils/helpers.ts' }
  ],
  unstaged: [
    { path: 'src/app.tsx', status: 'modified', oldPath: null },
    { path: 'src/styles/main.css', status: 'modified', oldPath: null },
    { path: 'README.md', status: 'modified', oldPath: null },
    { path: 'package.json', status: 'modified', oldPath: null }
  ],
  untracked: [
    { path: 'src/features/dashboard/index.tsx', status: 'untracked', oldPath: null },
    { path: 'src/features/dashboard/Dashboard.tsx', status: 'untracked', oldPath: null },
    { path: '.env.local', status: 'untracked', oldPath: null }
  ]
};
