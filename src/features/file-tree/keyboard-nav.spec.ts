import { describe, expect, it } from 'vitest';

import type { GitStatus } from '../../../tauri-bindings';
import { applyKeyboardNav } from './keyboard-nav';
import { buildFileTree } from './tree-builder';
import { flattenTree, getAllKeys } from './tree-utils';

const status: GitStatus = {
  staged: [{ path: 'a', kind: { status: 'deleted' } }],
  unstaged: [{ path: 'a/a.ts', kind: { status: 'added' } }],
  untracked: []
};

describe('file and directory sharing a path', () => {
  const tree = buildFileTree(status);

  it('gives every node a distinct key', () => {
    expect(getAllKeys(tree)).toStrictEqual(['a/', 'a/a.ts', 'a']);
  });

  it('walks the directory, its child, then the file', () => {
    const first = applyKeyboardNav(
      tree,
      { focusedKey: 'a/', collapsedKeys: new Set() },
      'ArrowDown'
    );
    const second = applyKeyboardNav(tree, first, 'ArrowDown');
    const third = applyKeyboardNav(tree, second, 'ArrowDown');
    expect([first.focusedKey, second.focusedKey, third.focusedKey]).toStrictEqual([
      'a/a.ts',
      'a',
      'a/'
    ]);
  });

  it('collapsing the directory keeps the file visible', () => {
    const collapsed = applyKeyboardNav(
      tree,
      { focusedKey: 'a/', collapsedKeys: new Set() },
      'ArrowLeft'
    );
    expect(flattenTree(tree, collapsed.collapsedKeys).map((f) => f.key)).toStrictEqual(['a/', 'a']);
  });

  it('ArrowLeft on the file does not touch the directory', () => {
    const result = applyKeyboardNav(
      tree,
      { focusedKey: 'a', collapsedKeys: new Set() },
      'ArrowLeft'
    );
    expect(result.focusedKey).toBe('a');
    expect(result.collapsedKeys.size).toBe(0);
  });
});
