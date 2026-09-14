import type { FileTreeNode } from './tree-builder';

export interface FlatNode {
  node: FileTreeNode;
  key: string;
  depth: number;
  parentPath: string | null;
  parentKey: string | null;
}

export function nodeKey(node: FileTreeNode): string {
  return node.type === 'directory' ? `${node.path}/` : node.path;
}

function walkTree(
  nodes: FileTreeNode[],
  onNode: (flat: FlatNode) => void,
  shouldDescend: (node: FileTreeNode) => boolean = (node) => node.type === 'directory',
  depth = 0,
  parentPath: string | null = null,
  parentKey: string | null = null
): void {
  for (const node of nodes) {
    const key = nodeKey(node);
    onNode({ node, key, depth, parentPath, parentKey });
    if (node.type === 'directory' && shouldDescend(node)) {
      walkTree(node.children, onNode, shouldDescend, depth + 1, node.path, key);
    }
  }
}

export function flattenTree(nodes: FileTreeNode[], collapsedKeys: Set<string>): FlatNode[] {
  const result: FlatNode[] = [];
  walkTree(
    nodes,
    (flat) => {
      result.push(flat);
    },
    (node) => node.type === 'directory' && !collapsedKeys.has(nodeKey(node))
  );
  return result;
}

export function getAllDirectoryKeys(nodes: FileTreeNode[]): Set<string> {
  const keys = new Set<string>();
  walkTree(nodes, ({ node, key }) => {
    if (node.type === 'directory') keys.add(key);
  });
  return keys;
}

export function getAllDirectoryPaths(nodes: FileTreeNode[]): Set<string> {
  const paths = new Set<string>();
  walkTree(nodes, ({ node }) => {
    if (node.type === 'directory') paths.add(node.path);
  });
  return paths;
}

export function getAllFilePaths(nodes: FileTreeNode[]): string[] {
  const paths: string[] = [];
  walkTree(nodes, ({ node }) => {
    if (node.type === 'file') paths.push(node.path);
  });
  return paths;
}

export function getAllKeys(nodes: FileTreeNode[]): string[] {
  const keys: string[] = [];
  walkTree(nodes, ({ key }) => {
    keys.push(key);
  });
  return keys;
}
