import type { GitStatus } from '#bindings/index';

export const mockGitStatus: GitStatus = {
  staged: [
    { path: 'src/features/diff-viewer/diff-viewer.tsx', kind: { status: 'modified' } },
    { path: 'src/features/comments/comment-components.tsx', kind: { status: 'modified' } },
    { path: 'src/lib/settings-store.ts', kind: { status: 'added' } },
    { path: 'src-tauri/src/comments.rs', kind: { status: 'modified' } },
    {
      path: 'src/utils/old-helpers.ts',
      kind: { status: 'renamed', old_path: 'src/utils/helpers.ts' }
    }
  ],
  unstaged: [
    { path: 'src/app.tsx', kind: { status: 'modified' } },
    { path: 'src/styles/main.css', kind: { status: 'modified' } },
    { path: 'README.md', kind: { status: 'modified' } },
    { path: 'package.json', kind: { status: 'modified' } }
  ],
  untracked: [
    { path: 'src/features/dashboard/index.tsx', kind: { status: 'untracked' } },
    { path: 'src/features/dashboard/Dashboard.tsx', kind: { status: 'untracked' } },
    { path: '.env.local', kind: { status: 'untracked' } }
  ]
};
