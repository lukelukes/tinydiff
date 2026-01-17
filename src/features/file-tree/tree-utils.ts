import type { FileTreeNode } from './tree-builder';

export interface FlatNode {
  node: FileTreeNode;
  depth: number;
  parentPath: string | null;
}

export function getAllDirectoryPaths(nodes: FileTreeNode[]): Set<string> {
  const paths = new Set<string>();

  function walk(nodes: FileTreeNode[]) {
    for (const node of nodes) {
      if (node.type === 'directory') {
        paths.add(node.path);
        walk(node.children);
      }
    }
  }

  walk(nodes);
  return paths;
}

export function flattenTree(
  nodes: FileTreeNode[],
  collapsedPaths: Set<string>,
  depth = 0,
  parentPath: string | null = null
): FlatNode[] {
  const result: FlatNode[] = [];

  for (const node of nodes) {
    result.push({ node, depth, parentPath });

    if (node.type === 'directory' && !collapsedPaths.has(node.path)) {
      result.push(...flattenTree(node.children, collapsedPaths, depth + 1, node.path));
    }
  }

  return result;
}

export function getAllFilePaths(nodes: FileTreeNode[]): string[] {
  const paths: string[] = [];

  function walk(nodes: FileTreeNode[]) {
    for (const node of nodes) {
      if (node.type === 'file') {
        paths.push(node.path);
      } else {
        walk(node.children);
      }
    }
  }

  walk(nodes);
  return paths;
}

export function getAllPaths(nodes: FileTreeNode[]): string[] {
  const paths: string[] = [];

  function walk(nodes: FileTreeNode[]) {
    for (const node of nodes) {
      paths.push(node.path);
      if (node.type === 'directory') {
        walk(node.children);
      }
    }
  }

  walk(nodes);
  return paths;
}
