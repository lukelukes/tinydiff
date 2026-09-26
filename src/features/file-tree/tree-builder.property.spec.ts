/* eslint-disable eslint-plugin-jest/no-conditional-in-test */
import * as fc from 'fast-check';
import { describe, it } from 'vitest';

import { gitStatusArb } from '#testing/git-status-arbitrary';

import type { GitStatus } from '../../../tauri-bindings';
import { buildFileTree, type FileNode, type FileTreeNode } from './tree-builder';
import { flattenTree } from './tree-utils';

function checkSorting(nodes: FileTreeNode[]): boolean {
  let seenFile = false;
  for (const node of nodes) {
    if (node.type === 'file') {
      seenFile = true;
    } else {
      if (seenFile) return false;
      if (!checkSorting(node.children)) return false;
    }
  }
  return true;
}

function checkAlphabetical(nodes: FileTreeNode[]): boolean {
  const dirs = nodes.filter((n) => n.type === 'directory');
  const files = nodes.filter((n) => n.type === 'file');

  const dirsSorted = dirs.every((d, i) => i === 0 || d.name.localeCompare(dirs[i - 1]!.name) >= 0);
  const filesSorted = files.every(
    (f, i) => i === 0 || f.name.localeCompare(files[i - 1]!.name) >= 0
  );

  if (!dirsSorted || !filesSorted) return false;

  return dirs.every((d) => checkAlphabetical(d.children));
}

function collectAllNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  const result: FileTreeNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.type === 'directory') {
      result.push(...collectAllNodes(node.children));
    }
  }
  return result;
}

function collectFiles(nodes: FileTreeNode[]): FileNode[] {
  return collectAllNodes(nodes).filter((n) => n.type === 'file');
}

function inputEntries(status: GitStatus): string[] {
  return [
    ...status.staged.map((f) => `staged ${f.path}`),
    ...status.unstaged.map((f) => `unstaged ${f.path}`),
    ...status.untracked.map((f) => `unstaged ${f.path}`)
  ].toSorted();
}

describe('buildFileTree properties', () => {
  it('file nodes never have children property', () => {
    fc.assert(
      fc.property(gitStatusArb, (status) => {
        const tree = buildFileTree(status);
        return collectFiles(tree).every((f) => !('children' in f));
      })
    );
  });

  it('directory nodes never have kind or target properties', () => {
    fc.assert(
      fc.property(gitStatusArb, (status) => {
        const tree = buildFileTree(status);
        return collectAllNodes(tree)
          .filter((n) => n.type === 'directory')
          .every((d) => !('kind' in d) && !('target' in d));
      })
    );
  });

  it('emits exactly one file node per input entry, with its target', () => {
    fc.assert(
      fc.property(gitStatusArb, (status) => {
        const tree = buildFileTree(status);
        const output = collectFiles(tree)
          .map((f) => `${f.target} ${f.path}`)
          .toSorted();
        const expected = inputEntries(status);
        return (
          output.length === expected.length && output.every((entry, i) => entry === expected[i])
        );
      })
    );
  });

  it('gives every node a distinct id', () => {
    fc.assert(
      fc.property(gitStatusArb, (status) => {
        const ids = collectAllNodes(buildFileTree(status)).map((n) => n.id);
        return new Set(ids).size === ids.length;
      })
    );
  });

  it('directories are always sorted before files at same level', () => {
    fc.assert(
      fc.property(gitStatusArb, (status) => {
        const tree = buildFileTree(status);
        return checkSorting(tree);
      })
    );
  });

  it('nodes within same type are alphabetically sorted', () => {
    fc.assert(
      fc.property(gitStatusArb, (status) => {
        const tree = buildFileTree(status);
        return checkAlphabetical(tree);
      })
    );
  });
});

describe('flattenTree properties', () => {
  it('flattened output contains every node when nothing collapsed', () => {
    fc.assert(
      fc.property(gitStatusArb, (status) => {
        const tree = buildFileTree(status);
        const flatIds = flattenTree(tree, new Set()).map((n) => n.node.id);
        const allIds = collectAllNodes(tree).map((n) => n.id);

        return flatIds.length === allIds.length && allIds.every((id, i) => id === flatIds[i]);
      })
    );
  });

  it('collapsed folders hide their descendants and nothing else', () => {
    fc.assert(
      fc.property(gitStatusArb, fc.nat(), (status, seed) => {
        const tree = buildFileTree(status);
        const allNodes = collectAllNodes(tree);
        const dirs = allNodes.filter((n) => n.type === 'directory');

        if (dirs.length === 0) return true;

        const collapsedDir = dirs[seed % dirs.length]!;
        const isDescendant = (node: FileTreeNode) => node.path.startsWith(`${collapsedDir.path}/`);
        const flatIds = flattenTree(tree, new Set([collapsedDir.id])).map((n) => n.node.id);
        const expectedIds = allNodes.filter((n) => !isDescendant(n)).map((n) => n.id);

        return (
          flatIds.length === expectedIds.length && expectedIds.every((id, i) => id === flatIds[i])
        );
      })
    );
  });

  it('depth increases by 1 for each nesting level', () => {
    fc.assert(
      fc.property(gitStatusArb, (status) => {
        const tree = buildFileTree(status);
        const flat = flattenTree(tree, new Set());

        return flat.every((item) => {
          const expectedDepth = item.node.path.split('/').length - 1;
          return item.depth === expectedDepth;
        });
      })
    );
  });

  it('parentId references the containing directory', () => {
    fc.assert(
      fc.property(gitStatusArb, (status) => {
        const tree = buildFileTree(status);
        const byId = new Map(collectAllNodes(tree).map((n) => [n.id, n]));
        const flat = flattenTree(tree, new Set());

        return flat.every((item) => {
          const parts = item.node.path.split('/');
          if (parts.length === 1) {
            return item.parentId === null;
          }
          const parent = item.parentId === null ? undefined : byId.get(item.parentId);
          return (
            parent?.type === 'directory' &&
            parent.path === parts.slice(0, -1).join('/') &&
            parent.children.includes(item.node)
          );
        });
      })
    );
  });
});
