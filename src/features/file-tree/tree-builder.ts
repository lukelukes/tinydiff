import type { CSSProperties } from 'react';

import type { FileEntry, FileEntryKind, GitStatus } from '../../../tauri-bindings';

type FileStatus = FileEntryKind['status'];

export interface FileNode {
  type: 'file';
  name: string;
  path: string;
  kind: FileEntryKind;
  isStaged: boolean;
}

export interface DirectoryNode {
  type: 'directory';
  name: string;
  path: string;
  children: FileTreeNode[];
}

export type FileTreeNode = FileNode | DirectoryNode;

export function isFileNode(node: FileTreeNode): node is FileNode {
  return node.type === 'file';
}

export function isDirectoryNode(node: FileTreeNode): node is DirectoryNode {
  return node.type === 'directory';
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

  const root: DirectoryNode = {
    type: 'directory',
    name: '',
    path: '',
    children: []
  };

  for (const file of allFiles) {
    const parts = file.path.split('/');
    let current: DirectoryNode = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const isFile = i === parts.length - 1;
      const pathSoFar = parts.slice(0, i + 1).join('/');

      if (isFile) {
        current.children.push({
          type: 'file',
          name: part,
          path: file.path,
          kind: file.kind,
          isStaged: file.isStaged
        });
      } else {
        let dir = current.children.find(
          (c): c is DirectoryNode => c.type === 'directory' && c.name === part
        );
        if (!dir) {
          dir = {
            type: 'directory',
            name: part,
            path: pathSoFar,
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

function sortTree(node: DirectoryNode): void {
  node.children.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  for (const child of node.children) {
    if (isDirectoryNode(child)) {
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
    default:
      return status satisfies never;
  }
}

/**
 * Get CSS class for a file status
 */
export function getStatusColorClass(status: FileStatus): string {
  switch (status) {
    case 'added':
      return 'text-git-added';
    case 'untracked':
      return 'text-git-untracked';
    case 'modified':
      return 'text-git-modified';
    case 'deleted':
      return 'text-git-deleted';
    case 'renamed':
      return 'text-git-renamed';
    case 'typechange':
      return 'text-git-renamed';
    case 'conflicted':
      return 'text-git-conflicted';
    default:
      return status satisfies never;
  }
}

/**
 * Get inline styles for file status badge
 */
export function getStatusStyles(status: FileStatus): CSSProperties {
  switch (status) {
    case 'added':
      return { backgroundColor: 'var(--git-added-bg)', color: 'var(--git-added)' };
    case 'untracked':
      return { backgroundColor: 'var(--git-untracked-bg)', color: 'var(--git-untracked)' };
    case 'modified':
      return { backgroundColor: 'var(--git-modified-bg)', color: 'var(--git-modified)' };
    case 'deleted':
      return { backgroundColor: 'var(--git-deleted-bg)', color: 'var(--git-deleted)' };
    case 'renamed':
      return { backgroundColor: 'var(--git-renamed-bg)', color: 'var(--git-renamed)' };
    case 'typechange':
      return { backgroundColor: 'var(--git-renamed-bg)', color: 'var(--git-renamed)' };
    case 'conflicted':
      return { backgroundColor: 'var(--git-conflicted-bg)', color: 'var(--git-conflicted)' };
    default:
      return status satisfies never;
  }
}
