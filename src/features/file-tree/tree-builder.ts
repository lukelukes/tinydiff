import type { DiffTarget, FileEntry, FileEntryKind, GitStatus } from '../../../tauri-bindings';

type FileStatus = FileEntryKind['status'];

export interface FileNode {
  type: 'file';
  id: string;
  name: string;
  path: string;
  kind: FileEntryKind;
  target: DiffTarget;
}

export interface DirectoryNode {
  type: 'directory';
  id: string;
  name: string;
  path: string;
  children: FileTreeNode[];
}

export type FileTreeNode = FileNode | DirectoryNode;

interface TargetedFile extends FileEntry {
  target: DiffTarget;
}

export function buildFileTree(status: GitStatus): FileTreeNode[] {
  const files: TargetedFile[] = [
    ...status.staged.map((f) => ({ ...f, target: 'staged' as const })),
    ...status.unstaged.map((f) => ({ ...f, target: 'unstaged' as const })),
    ...status.untracked.map((f) => ({ ...f, target: 'unstaged' as const }))
  ];

  const root = createDirectory('', '');
  const directories = new Map<string, DirectoryNode>([['', root]]);

  for (const file of files) {
    const segments = file.path.split('/');
    const fileName = segments.pop();
    if (!fileName) continue;
    let parent = root;
    let directoryPath = '';

    for (const segment of segments) {
      directoryPath = directoryPath ? `${directoryPath}/${segment}` : segment;
      const cached = directories.get(directoryPath);
      if (cached) {
        parent = cached;
        continue;
      }
      const next = createDirectory(segment, directoryPath);
      parent.children.push(next);
      directories.set(directoryPath, next);
      parent = next;
    }

    parent.children.push(createFileNode(fileName, file));
  }

  sortTree(root);
  return root.children;
}

function createDirectory(name: string, path: string): DirectoryNode {
  return { type: 'directory', id: `dir:${path}`, name, path, children: [] };
}

function createFileNode(name: string, file: TargetedFile): FileNode {
  return {
    type: 'file',
    id: `${file.target}:${file.path}`,
    name,
    path: file.path,
    kind: file.kind,
    target: file.target
  };
}

function sortTree(node: DirectoryNode): void {
  node.children.sort(compareNodes);
  for (const child of node.children) {
    if (child.type === 'directory') {
      sortTree(child);
    }
  }
}

function compareNodes(a: FileTreeNode, b: FileTreeNode): number {
  if (a.type !== b.type) {
    return a.type === 'directory' ? -1 : 1;
  }
  return a.name.localeCompare(b.name);
}

const STATUS_META = {
  added: { label: 'A', className: 'text-git-added', colorName: 'added' },
  modified: { label: 'M', className: 'text-git-modified', colorName: 'modified' },
  deleted: { label: 'D', className: 'text-git-deleted', colorName: 'deleted' },
  renamed: { label: 'R', className: 'text-git-renamed', colorName: 'renamed' },
  untracked: { label: 'U', className: 'text-git-untracked', colorName: 'untracked' },
  typechange: { label: 'T', className: 'text-git-renamed', colorName: 'renamed' },
  conflicted: { label: 'C', className: 'text-git-conflicted', colorName: 'conflicted' }
} satisfies Record<FileStatus, { label: string; className: string; colorName: string }>;

export function getStatusLabel(status: FileStatus): string {
  return STATUS_META[status].label;
}
