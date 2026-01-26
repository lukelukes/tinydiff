/* eslint-disable eslint-plugin-jest/no-conditional-in-test */
import fc from 'fast-check';
import { describe, it } from 'vitest';

import type { GitStatus } from '../../../tauri-bindings';

import { buildFileTree, type FileTreeNode } from './tree-builder';
import { flattenTree, getAllDirectoryPaths, getAllFilePaths, getAllPaths } from './tree-utils';

const lowerAlphaNumChars = Array.from('abcdefghijklmnopqrstuvwxyz0123456789_-');
const lowerAlphaChars = Array.from('abcdefghijklmnopqrstuvwxyz');

const fileNameArb = fc
  .tuple(
    fc.constantFrom(...lowerAlphaChars),
    fc.string({ unit: fc.constantFrom(...lowerAlphaNumChars), minLength: 0, maxLength: 10 })
  )
  .map(([first, rest]) => first + rest);

const extensionArb = fc.constantFrom('.ts', '.tsx', '.js', '.json', '.md', '');

const filePathArb = fc
  .tuple(fc.array(fileNameArb, { minLength: 0, maxLength: 4 }), fileNameArb, extensionArb)
  .map(([dirs, name, ext]) => [...dirs, `${name}${ext}`].join('/'));

const uniqueFilePathsArb = fc
  .array(filePathArb, { minLength: 0, maxLength: 30 })
  .map((paths) => Array.from(new Set(paths)));

function createGitStatus(paths: string[]): GitStatus {
  return {
    staged: [],
    unstaged: paths.map((path) => ({
      path,
      kind: { status: 'modified' as const }
    })),
    untracked: []
  };
}

function countFiles(nodes: FileTreeNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.type === 'file') {
      count++;
    } else {
      count += countFiles(node.children);
    }
  }
  return count;
}

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

describe('buildFileTree properties', () => {
  it('preserves all file paths from input', () => {
    fc.assert(
      fc.property(uniqueFilePathsArb, (paths) => {
        const status = createGitStatus(paths);
        const tree = buildFileTree(status);
        const outputPaths = getAllFilePaths(tree);
        return paths.every((p) => outputPaths.includes(p));
      })
    );
  });

  it('file count in tree equals input file count', () => {
    fc.assert(
      fc.property(uniqueFilePathsArb, (paths) => {
        const status = createGitStatus(paths);
        const tree = buildFileTree(status);
        return countFiles(tree) === paths.length;
      })
    );
  });

  it('directories are always sorted before files at same level', () => {
    fc.assert(
      fc.property(uniqueFilePathsArb, (paths) => {
        const status = createGitStatus(paths);
        const tree = buildFileTree(status);
        return checkSorting(tree);
      })
    );
  });

  it('nodes within same type are alphabetically sorted', () => {
    fc.assert(
      fc.property(uniqueFilePathsArb, (paths) => {
        const status = createGitStatus(paths);
        const tree = buildFileTree(status);
        return checkAlphabetical(tree);
      })
    );
  });
});

describe('flattenTree properties', () => {
  it('flattened output contains all paths when nothing collapsed', () => {
    fc.assert(
      fc.property(uniqueFilePathsArb, (paths) => {
        const status = createGitStatus(paths);
        const tree = buildFileTree(status);
        const flat = flattenTree(tree, new Set());
        const flatPaths = new Set(flat.map((n) => n.node.path));

        return paths.every((p) => flatPaths.has(p));
      })
    );
  });

  it('collapsed folders hide their descendants', () => {
    fc.assert(
      fc.property(uniqueFilePathsArb, fc.nat(), (paths, seed) => {
        const status = createGitStatus(paths);
        const tree = buildFileTree(status);
        const allDirs = getAllDirectoryPaths(tree);

        if (allDirs.size === 0) return true;

        const dirsArray = [...allDirs];
        const collapsedDir = dirsArray[seed % dirsArray.length]!;
        const collapsed = new Set([collapsedDir]);
        const flat = flattenTree(tree, collapsed);
        const flatPaths = flat.map((n) => n.node.path);

        return !flatPaths.some((p) => p !== collapsedDir && p.startsWith(collapsedDir + '/'));
      })
    );
  });

  it('depth increases by 1 for each nesting level', () => {
    fc.assert(
      fc.property(uniqueFilePathsArb, (paths) => {
        const status = createGitStatus(paths);
        const tree = buildFileTree(status);
        const flat = flattenTree(tree, new Set());

        return flat.every((item) => {
          const expectedDepth = item.node.path.split('/').length - 1;
          return item.depth === expectedDepth;
        });
      })
    );
  });

  it('parentPath correctly references parent directory', () => {
    fc.assert(
      fc.property(uniqueFilePathsArb, (paths) => {
        const status = createGitStatus(paths);
        const tree = buildFileTree(status);
        const flat = flattenTree(tree, new Set());

        return flat.every((item) => {
          const parts = item.node.path.split('/');
          if (parts.length === 1) {
            return item.parentPath === null;
          }
          const expectedParent = parts.slice(0, -1).join('/');
          return item.parentPath === expectedParent;
        });
      })
    );
  });
});

describe('getAllPaths properties', () => {
  it('returns all file and directory paths', () => {
    fc.assert(
      fc.property(uniqueFilePathsArb, (paths) => {
        const status = createGitStatus(paths);
        const tree = buildFileTree(status);
        const allPaths = getAllPaths(tree);

        const filePaths = getAllFilePaths(tree);
        const dirPaths = getAllDirectoryPaths(tree);

        return (
          filePaths.every((p) => allPaths.includes(p)) &&
          [...dirPaths].every((p) => allPaths.includes(p))
        );
      })
    );
  });
});
