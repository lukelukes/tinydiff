import type { FileEntry, FileStatus, GitStatus } from '../../../tauri-bindings';

export type TreeNodeType = 'file' | 'directory';

export interface FileTreeNode {
  name: string;
  path: string;
  type: TreeNodeType;
  status?: FileStatus;
  oldPath?: string | null;
  isStaged: boolean;
  children: FileTreeNode[];
}

interface FileWithStaged extends FileEntry {
  isStaged: boolean;
}

/**
 * Build a tree structure from git status.
 * Groups files by directory and creates nested structure.
 */
export function buildFileTree(status: GitStatus): FileTreeNode[] {
  const allFiles: FileWithStaged[] = [
    ...status.staged.map((f) => ({ ...f, isStaged: true })),
    ...status.unstaged.map((f) => ({ ...f, isStaged: false })),
    ...status.untracked.map((f) => ({ ...f, isStaged: false }))
  ];

  const root: FileTreeNode = {
    name: '',
    path: '',
    type: 'directory',
    isStaged: false,
    children: []
  };

  for (const file of allFiles) {
    const parts = file.path.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const isFile = i === parts.length - 1;
      const pathSoFar = parts.slice(0, i + 1).join('/');

      if (isFile) {
        current.children.push({
          name: part,
          path: file.path,
          type: 'file',
          status: file.status,
          oldPath: file.oldPath,
          isStaged: file.isStaged,
          children: []
        });
      } else {
        let dir = current.children.find((c) => c.type === 'directory' && c.name === part);
        if (!dir) {
          dir = {
            name: part,
            path: pathSoFar,
            type: 'directory',
            isStaged: false,
            children: []
          };
          current.children.push(dir);
        }
        current = dir;
      }
    }
  }

  sortTree(root);
  return root.children;
}

function sortTree(node: FileTreeNode): void {
  node.children.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  for (const child of node.children) {
    if (child.type === 'directory') {
      sortTree(child);
    }
  }
}

/**
 * Get display label for a file status
 */
export function getStatusLabel(status: FileStatus): string {
  switch (status) {
    case 'added':
      return 'A';
    case 'modified':
      return 'M';
    case 'deleted':
      return 'D';
    case 'renamed':
      return 'R';
    case 'untracked':
      return 'U';
    case 'typechange':
      return 'T';
    case 'conflicted':
      return 'C';
  }
}

/**
 * Get CSS class for a file status
 */
export function getStatusColorClass(status: FileStatus): string {
  switch (status) {
    case 'added':
    case 'untracked':
      return 'text-green-500';
    case 'modified':
      return 'text-yellow-500';
    case 'deleted':
      return 'text-red-500';
    case 'renamed':
      return 'text-blue-500';
    case 'typechange':
      return 'text-purple-500';
    case 'conflicted':
      return 'text-orange-500';
  }
}
