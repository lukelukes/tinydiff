/* eslint-disable eslint-plugin-jest/no-conditional-in-test */
import * as fc from 'fast-check';
import { describe, it } from 'vitest';

import type { GitStatus } from '../../../tauri-bindings';
import { applyKeyboardNav, type NavigationKey, type NavigationState } from './keyboard-nav';
import { buildFileTree, type FileTreeNode } from './tree-builder';
import { getAllKeys, nodeKey } from './tree-utils';

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

function getLastKey(nodes: FileTreeNode[]): string | undefined {
  const last = nodes.at(-1);
  if (!last) return undefined;
  if (last.type === 'directory' && last.children.length > 0) {
    return getLastKey(last.children);
  }
  return nodeKey(last);
}

describe('keyboard navigation invariants', () => {
  it('focus always lands on a valid path after any key', () => {
    fc.assert(
      fc.property(uniqueFilePathsArb, navKeyArb, (paths, key) => {
        const status = createGitStatus(paths);
        const tree = buildFileTree(status);
        const allKeys = getAllKeys(tree);

        if (allKeys.length === 0) return true;

        const state: NavigationState = {
          focusedKey: allKeys[0]!,
          collapsedKeys: new Set()
        };

        const result = applyKeyboardNav(tree, state, key);

        return result.focusedKey === null || allKeys.includes(result.focusedKey);
      })
    );
  });

  it('focus always lands on valid path after any key sequence', () => {
    fc.assert(
      fc.property(uniqueFilePathsArb, keySequenceArb, (paths, keys) => {
        const status = createGitStatus(paths);
        const tree = buildFileTree(status);
        const allKeys = getAllKeys(tree);

        if (allKeys.length === 0) return true;

        let state: NavigationState = {
          focusedKey: allKeys[0]!,
          collapsedKeys: new Set()
        };

        for (const key of keys) {
          state = applyKeyboardNav(tree, state, key);
        }

        return state.focusedKey === null || allKeys.includes(state.focusedKey);
      })
    );
  });

  it('Home always moves to first visible item', () => {
    fc.assert(
      fc.property(uniqueFilePathsArb, fc.nat(), (paths, startIdx) => {
        const status = createGitStatus(paths);
        const tree = buildFileTree(status);
        const allKeys = getAllKeys(tree);

        if (allKeys.length === 0) return true;

        const startKey = allKeys[startIdx % allKeys.length]!;
        const state: NavigationState = {
          focusedKey: startKey,
          collapsedKeys: new Set()
        };

        const result = applyKeyboardNav(tree, state, 'Home');

        return result.focusedKey === (tree[0] ? nodeKey(tree[0]) : undefined);
      })
    );
  });

  it('End always moves to last visible item', () => {
    fc.assert(
      fc.property(uniqueFilePathsArb, fc.nat(), (paths, startIdx) => {
        const status = createGitStatus(paths);
        const tree = buildFileTree(status);
        const allKeys = getAllKeys(tree);

        if (allKeys.length === 0) return true;

        const startKey = allKeys[startIdx % allKeys.length]!;
        const state: NavigationState = {
          focusedKey: startKey,
          collapsedKeys: new Set()
        };

        const result = applyKeyboardNav(tree, state, 'End');

        return result.focusedKey === getLastKey(tree);
      })
    );
  });

  it('ArrowDown wraps around from last to first', () => {
    fc.assert(
      fc.property(uniqueFilePathsArb, (paths) => {
        const status = createGitStatus(paths);
        const tree = buildFileTree(status);

        if (tree.length === 0) return true;

        const lastKey = getLastKey(tree);
        if (lastKey === undefined) return true;

        const state: NavigationState = {
          focusedKey: lastKey,
          collapsedKeys: new Set()
        };

        const result = applyKeyboardNav(tree, state, 'ArrowDown');

        return result.focusedKey === (tree[0] ? nodeKey(tree[0]) : undefined);
      })
    );
  });

  it('ArrowUp wraps around from first to last', () => {
    fc.assert(
      fc.property(uniqueFilePathsArb, (paths) => {
        const status = createGitStatus(paths);
        const tree = buildFileTree(status);

        if (tree.length === 0) return true;

        const firstKey = nodeKey(tree[0]!);

        const state: NavigationState = {
          focusedKey: firstKey,
          collapsedKeys: new Set()
        };

        const result = applyKeyboardNav(tree, state, 'ArrowUp');

        return result.focusedKey === getLastKey(tree);
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
          focusedKey: nodeKey(firstDir),
          collapsedKeys: new Set([nodeKey(firstDir)])
        };

        const result = applyKeyboardNav(tree, state, 'ArrowRight');

        return !result.collapsedKeys.has(nodeKey(firstDir));
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
          focusedKey: nodeKey(firstDir),
          collapsedKeys: new Set()
        };

        const result = applyKeyboardNav(tree, state, 'ArrowLeft');

        return result.collapsedKeys.has(nodeKey(firstDir));
      })
    );
  });

  it('navigation is deterministic', () => {
    fc.assert(
      fc.property(uniqueFilePathsArb, keySequenceArb, (paths, keys) => {
        const status = createGitStatus(paths);
        const tree = buildFileTree(status);
        const allKeys = getAllKeys(tree);

        if (allKeys.length === 0) return true;

        const initialState: NavigationState = {
          focusedKey: allKeys[0]!,
          collapsedKeys: new Set()
        };

        let state1 = initialState;
        let state2 = initialState;

        for (const key of keys) {
          state1 = applyKeyboardNav(tree, state1, key);
          state2 = applyKeyboardNav(tree, state2, key);
        }

        return (
          state1.focusedKey === state2.focusedKey &&
          state1.collapsedKeys.size === state2.collapsedKeys.size &&
          [...state1.collapsedKeys].every((p) => state2.collapsedKeys.has(p))
        );
      })
    );
  });
});
