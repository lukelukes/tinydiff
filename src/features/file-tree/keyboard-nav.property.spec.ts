/* eslint-disable eslint-plugin-jest/no-conditional-in-test */
import * as fc from 'fast-check';
import { describe, it } from 'vitest';

import { gitStatusArb } from '#testing/git-status-arbitrary';

import { applyKeyboardNav, type NavigationKey, type NavigationState } from './keyboard-nav';
import { buildFileTree, type FileTreeNode } from './tree-builder';

const navKeyArb = fc.constantFrom<NavigationKey>(
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End'
);

const keySequenceArb = fc.array(navKeyArb, { minLength: 1, maxLength: 20 });

function allIds(nodes: FileTreeNode[]): string[] {
  return nodes.flatMap((node) =>
    node.type === 'directory' ? [node.id, ...allIds(node.children)] : [node.id]
  );
}

function getLastId(nodes: FileTreeNode[]): string | undefined {
  const last = nodes.at(-1);
  if (!last) return undefined;
  if (last.type === 'directory' && last.children.length > 0) {
    return getLastId(last.children);
  }
  return last.id;
}

describe('keyboard navigation invariants', () => {
  it('focus always lands on a valid node after any key', () => {
    fc.assert(
      fc.property(gitStatusArb, navKeyArb, (status, key) => {
        const tree = buildFileTree(status);
        const ids = allIds(tree);

        if (ids.length === 0) return true;

        const state: NavigationState = {
          focusedId: ids[0]!,
          collapsedIds: new Set()
        };

        const result = applyKeyboardNav(tree, state, key);

        return result.focusedId === null || ids.includes(result.focusedId);
      })
    );
  });

  it('focus always lands on a valid node after any key sequence', () => {
    fc.assert(
      fc.property(gitStatusArb, keySequenceArb, (status, keys) => {
        const tree = buildFileTree(status);
        const ids = allIds(tree);

        if (ids.length === 0) return true;

        let state: NavigationState = {
          focusedId: ids[0]!,
          collapsedIds: new Set()
        };

        for (const key of keys) {
          state = applyKeyboardNav(tree, state, key);
        }

        return state.focusedId === null || ids.includes(state.focusedId);
      })
    );
  });

  it('ArrowDown from the first row visits every row exactly once before wrapping', () => {
    fc.assert(
      fc.property(gitStatusArb, (status) => {
        const tree = buildFileTree(status);
        const ids = allIds(tree);

        if (ids.length === 0) return true;

        let state: NavigationState = { focusedId: ids[0]!, collapsedIds: new Set() };
        const visited = [state.focusedId];
        for (let i = 1; i < ids.length; i++) {
          state = applyKeyboardNav(tree, state, 'ArrowDown');
          visited.push(state.focusedId);
        }
        const wrapped = applyKeyboardNav(tree, state, 'ArrowDown');

        return new Set(visited).size === ids.length && wrapped.focusedId === ids[0];
      })
    );
  });

  it('Home always moves to first visible item', () => {
    fc.assert(
      fc.property(gitStatusArb, fc.nat(), (status, startIdx) => {
        const tree = buildFileTree(status);
        const ids = allIds(tree);

        if (ids.length === 0) return true;

        const state: NavigationState = {
          focusedId: ids[startIdx % ids.length]!,
          collapsedIds: new Set()
        };

        const result = applyKeyboardNav(tree, state, 'Home');

        return result.focusedId === tree[0]?.id;
      })
    );
  });

  it('End always moves to last visible item', () => {
    fc.assert(
      fc.property(gitStatusArb, fc.nat(), (status, startIdx) => {
        const tree = buildFileTree(status);
        const ids = allIds(tree);

        if (ids.length === 0) return true;

        const state: NavigationState = {
          focusedId: ids[startIdx % ids.length]!,
          collapsedIds: new Set()
        };

        const result = applyKeyboardNav(tree, state, 'End');

        return result.focusedId === getLastId(tree);
      })
    );
  });

  it('ArrowDown wraps around from last to first', () => {
    fc.assert(
      fc.property(gitStatusArb, (status) => {
        const tree = buildFileTree(status);
        const lastId = getLastId(tree);

        if (lastId === undefined) return true;

        const state: NavigationState = {
          focusedId: lastId,
          collapsedIds: new Set()
        };

        const result = applyKeyboardNav(tree, state, 'ArrowDown');

        return result.focusedId === tree[0]?.id;
      })
    );
  });

  it('ArrowUp wraps around from first to last', () => {
    fc.assert(
      fc.property(gitStatusArb, (status) => {
        const tree = buildFileTree(status);
        const first = tree[0];

        if (!first) return true;

        const state: NavigationState = {
          focusedId: first.id,
          collapsedIds: new Set()
        };

        const result = applyKeyboardNav(tree, state, 'ArrowUp');

        return result.focusedId === getLastId(tree);
      })
    );
  });

  it('ArrowRight on collapsed directory expands it', () => {
    fc.assert(
      fc.property(gitStatusArb, (status) => {
        const tree = buildFileTree(status);

        const firstDir = tree.find((n) => n.type === 'directory');
        if (!firstDir) return true;

        const state: NavigationState = {
          focusedId: firstDir.id,
          collapsedIds: new Set([firstDir.id])
        };

        const result = applyKeyboardNav(tree, state, 'ArrowRight');

        return !result.collapsedIds.has(firstDir.id);
      })
    );
  });

  it('ArrowLeft on expanded directory collapses it', () => {
    fc.assert(
      fc.property(gitStatusArb, (status) => {
        const tree = buildFileTree(status);

        const firstDir = tree.find((n) => n.type === 'directory');
        if (!firstDir) return true;

        const state: NavigationState = {
          focusedId: firstDir.id,
          collapsedIds: new Set()
        };

        const result = applyKeyboardNav(tree, state, 'ArrowLeft');

        return result.collapsedIds.has(firstDir.id);
      })
    );
  });

  it('navigation is deterministic', () => {
    fc.assert(
      fc.property(gitStatusArb, keySequenceArb, (status, keys) => {
        const tree = buildFileTree(status);
        const ids = allIds(tree);

        if (ids.length === 0) return true;

        const initialState: NavigationState = {
          focusedId: ids[0]!,
          collapsedIds: new Set()
        };

        let state1 = initialState;
        let state2 = initialState;

        for (const key of keys) {
          state1 = applyKeyboardNav(tree, state1, key);
          state2 = applyKeyboardNav(tree, state2, key);
        }

        return (
          state1.focusedId === state2.focusedId &&
          state1.collapsedIds.size === state2.collapsedIds.size &&
          [...state1.collapsedIds].every((id) => state2.collapsedIds.has(id))
        );
      })
    );
  });
});
