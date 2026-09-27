import type { FileTreeNode } from './tree-builder';

export interface FlatNode {
  node: FileTreeNode;
  depth: number;
  parentId: string | null;
}

export function flattenTree(nodes: FileTreeNode[], collapsedIds: ReadonlySet<string>): FlatNode[] {
  const result: FlatNode[] = [];
  const visit = (children: FileTreeNode[], depth: number, parentId: string | null) => {
    for (const node of children) {
      result.push({ node, depth, parentId });
      if (node.type === 'directory' && !collapsedIds.has(node.id)) {
        visit(node.children, depth + 1, node.id);
      }
    }
  };
  visit(nodes, 0, null);
  return result;
}
