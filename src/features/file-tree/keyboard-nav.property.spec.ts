/* eslint-disable eslint-plugin-jest/no-conditional-in-test */
import fc from 'fast-check';
import { describe, it } from 'vitest';

import type { GitStatus } from '../../../tauri-bindings';

import { applyKeyboardNav, type NavigationKey, type NavigationState } from './keyboard-nav';
import { buildFileTree, type FileTreeNode } from './tree-builder';
import { getAllPaths } from './tree-utils';

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
  .array(filePathArb, { minLength: 1, maxLength: 30 })
  .map((paths) => Array.from(new Set(paths)))
  .filter((paths) => paths.length > 0);

const navKeyArb = fc.constantFrom<NavigationKey>(
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End'
);

const keySequenceArb = fc.array(navKeyArb, { minLength: 1, maxLength: 20 });

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

function getLastPath(nodes: FileTreeNode[]): string | undefined {
  const last = nodes.at(-1);
  if (!last) return undefined;
  if (last.type === 'directory' && last.children.length > 0) {
    return getLastPath(last.children);
  }
  return last.path;
}

describe('keyboard navigation invariants', () => {
  it('focus always lands on a valid path after any key', () => {
    fc.assert(
      fc.property(uniqueFilePathsArb, navKeyArb, (paths, key) => {
        const status = createGitStatus(paths);
        const tree = buildFileTree(status);
        const allPaths = getAllPaths(tree);

        if (allPaths.length === 0) return true;

        const state: NavigationState = {
          focusedPath: allPaths[0]!,
          collapsedPaths: new Set()
        };

        const result = applyKeyboardNav(tree, state, key);

        return result.focusedPath === null || allPaths.includes(result.focusedPath);
      })
    );
  });

  it('focus always lands on valid path after any key sequence', () => {
    fc.assert(
      fc.property(uniqueFilePathsArb, keySequenceArb, (paths, keys) => {
        const status = createGitStatus(paths);
        const tree = buildFileTree(status);
        const allPaths = getAllPaths(tree);

        if (allPaths.length === 0) return true;

        let state: NavigationState = {
          focusedPath: allPaths[0]!,
          collapsedPaths: new Set()
        };

        for (const key of keys) {
          state = applyKeyboardNav(tree, state, key);
        }

        return state.focusedPath === null || allPaths.includes(state.focusedPath);
      })
    );
  });

  it('Home always moves to first visible item', () => {
    fc.assert(
      fc.property(uniqueFilePathsArb, fc.nat(), (paths, startIdx) => {
        const status = createGitStatus(paths);
        const tree = buildFileTree(status);
        const allPaths = getAllPaths(tree);

        if (allPaths.length === 0) return true;

        const startPath = allPaths[startIdx % allPaths.length]!;
        const state: NavigationState = {
          focusedPath: startPath,
          collapsedPaths: new Set()
        };

        const result = applyKeyboardNav(tree, state, 'Home');

        return result.focusedPath === tree[0]?.path;
      })
    );
  });

  it('End always moves to last visible item', () => {
    fc.assert(
      fc.property(uniqueFilePathsArb, fc.nat(), (paths, startIdx) => {
        const status = createGitStatus(paths);
        const tree = buildFileTree(status);
        const allPaths = getAllPaths(tree);

        if (allPaths.length === 0) return true;

        const startPath = allPaths[startIdx % allPaths.length]!;
        const state: NavigationState = {
          focusedPath: startPath,
          collapsedPaths: new Set()
        };

        const result = applyKeyboardNav(tree, state, 'End');

        return result.focusedPath === getLastPath(tree);
      })
    );
  });

  it('ArrowDown wraps around from last to first', () => {
    fc.assert(
      fc.property(uniqueFilePathsArb, (paths) => {
        const status = createGitStatus(paths);
        const tree = buildFileTree(status);

        if (tree.length === 0) return true;

        const lastPath = getLastPath(tree);
        if (lastPath === undefined) return true;

        const state: NavigationState = {
          focusedPath: lastPath,
          collapsedPaths: new Set()
        };

        const result = applyKeyboardNav(tree, state, 'ArrowDown');

        return result.focusedPath === tree[0]?.path;
      })
    );
  });

  it('ArrowUp wraps around from first to last', () => {
    fc.assert(
      fc.property(uniqueFilePathsArb, (paths) => {
        const status = createGitStatus(paths);
        const tree = buildFileTree(status);

        if (tree.length === 0) return true;

        const firstPath = tree[0]!.path;

        const state: NavigationState = {
          focusedPath: firstPath,
          collapsedPaths: new Set()
        };

        const result = applyKeyboardNav(tree, state, 'ArrowUp');

        return result.focusedPath === getLastPath(tree);
      })
    );
  });

  it('ArrowRight on collapsed directory expands it', () => {
    fc.assert(
      fc.property(uniqueFilePathsArb, (paths) => {
        const status = createGitStatus(paths);
        const tree = buildFileTree(status);

        const firstDir = tree.find((n) => n.type === 'directory');
        if (!firstDir) return true;

        const state: NavigationState = {
          focusedPath: firstDir.path,
          collapsedPaths: new Set([firstDir.path])
        };

        const result = applyKeyboardNav(tree, state, 'ArrowRight');

        return !result.collapsedPaths.has(firstDir.path);
      })
    );
  });

  it('ArrowLeft on expanded directory collapses it', () => {
    fc.assert(
      fc.property(uniqueFilePathsArb, (paths) => {
        const status = createGitStatus(paths);
        const tree = buildFileTree(status);

        const firstDir = tree.find((n) => n.type === 'directory');
        if (!firstDir) return true;

        const state: NavigationState = {
          focusedPath: firstDir.path,
          collapsedPaths: new Set()
        };

        const result = applyKeyboardNav(tree, state, 'ArrowLeft');

        return result.collapsedPaths.has(firstDir.path);
      })
    );
  });

  it('navigation is deterministic', () => {
    fc.assert(
      fc.property(uniqueFilePathsArb, keySequenceArb, (paths, keys) => {
        const status = createGitStatus(paths);
        const tree = buildFileTree(status);
        const allPaths = getAllPaths(tree);

        if (allPaths.length === 0) return true;

        const initialState: NavigationState = {
          focusedPath: allPaths[0]!,
          collapsedPaths: new Set()
        };

        let state1 = initialState;
        let state2 = initialState;

        for (const key of keys) {
          state1 = applyKeyboardNav(tree, state1, key);
          state2 = applyKeyboardNav(tree, state2, key);
        }

        return (
          state1.focusedPath === state2.focusedPath &&
          state1.collapsedPaths.size === state2.collapsedPaths.size &&
          [...state1.collapsedPaths].every((p) => state2.collapsedPaths.has(p))
        );
      })
    );
  });
});
