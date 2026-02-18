import type { FileTreeNode } from './tree-builder';

export interface FlatNode {
  node: FileTreeNode;
  depth: number;
  parentPath: string | null;
}

function walkTree(
  nodes: FileTreeNode[],
  onNode: (node: FileTreeNode, depth: number, parentPath: string | null) => void,
  shouldDescend: (node: FileTreeNode) => boolean = (node) => node.type === 'directory',
  depth = 0,
  parentPath: string | null = null
): void {
  for (const node of nodes) {
    onNode(node, depth, parentPath);
    if (node.type === 'directory' && shouldDescend(node)) {
      walkTree(node.children, onNode, shouldDescend, depth + 1, node.path);
    }
  }
}

export function flattenTree(
  nodes: FileTreeNode[],
  collapsedPaths: Set<string>,
  depth = 0,
  parentPath: string | null = null
): FlatNode[] {
  const result: FlatNode[] = [];
  walkTree(
    nodes,
    (node, currentDepth, currentParentPath) => {
      result.push({ node, depth: currentDepth, parentPath: currentParentPath });
    },
    (node) => node.type === 'directory' && !collapsedPaths.has(node.path),
    depth,
    parentPath
  );
  return result;
}

export function getAllDirectoryPaths(nodes: FileTreeNode[]): Set<string> {
  const paths = new Set<string>();
  walkTree(nodes, (node) => {
    if (node.type === 'directory') paths.add(node.path);
  });
  return paths;
}

export function getAllFilePaths(nodes: FileTreeNode[]): string[] {
  const paths: string[] = [];
  walkTree(nodes, (node) => {
    if (node.type === 'file') paths.push(node.path);
  });
  return paths;
}

export function getAllPaths(nodes: FileTreeNode[]): string[] {
  const paths: string[] = [];
  walkTree(nodes, (node) => {
    paths.push(node.path);
  });
  return paths;
}
