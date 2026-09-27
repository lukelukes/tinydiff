import { describe, expect, it } from 'vitest';

import type { GitStatus } from '../../../tauri-bindings';
import { applyKeyboardNav, type NavigationKey, type NavigationState } from './keyboard-nav';
import { buildFileTree, type FileTreeNode } from './tree-builder';
import { flattenTree } from './tree-utils';

function describeNode(node: FileTreeNode): string {
  return node.type === 'directory' ? `directory ${node.path}` : `${node.target} ${node.path}`;
}

function setup(status: GitStatus) {
  const tree = buildFileTree(status);
  const rows = flattenTree(tree, new Set()).map((f) => f.node);
  const idOf = (description: string) => {
    const node = rows.find((n) => describeNode(n) === description);
    if (!node) throw new Error(`no node ${description}`);
    return node.id;
  };
  const describeId = (id: string | null) => {
    const node = rows.find((n) => n.id === id);
    return node ? describeNode(node) : null;
  };
  const press = (start: NavigationState, keys: NavigationKey[]) => {
    const states = [start];
    for (const key of keys) states.push(applyKeyboardNav(tree, states.at(-1)!, key));
    return states.slice(1);
  };
  return { tree, rows, idOf, describeId, press };
}

describe('file and directory sharing a path', () => {
  const { tree, rows, idOf, describeId, press } = setup({
    staged: [{ path: 'a', kind: { status: 'deleted' } }],
    unstaged: [{ path: 'a/a.ts', kind: { status: 'added' } }],
    untracked: []
  });

  it('renders the directory, its child, then the file as distinct rows', () => {
    expect(rows.map((n) => describeNode(n))).toStrictEqual([
      'directory a',
      'unstaged a/a.ts',
      'staged a'
    ]);
    expect(new Set(rows.map((n) => n.id)).size).toBe(3);
  });

  it('walks the directory, its child, then the file', () => {
    const states = press({ focusedId: idOf('directory a'), collapsedIds: new Set() }, [
      'ArrowDown',
      'ArrowDown',
      'ArrowDown'
    ]);
    expect(states.map((s) => describeId(s.focusedId))).toStrictEqual([
      'unstaged a/a.ts',
      'staged a',
      'directory a'
    ]);
  });

  it('collapsing the directory keeps the file visible', () => {
    const [collapsed] = press({ focusedId: idOf('directory a'), collapsedIds: new Set() }, [
      'ArrowLeft'
    ]);
    expect(
      flattenTree(tree, collapsed!.collapsedIds).map((f) => describeNode(f.node))
    ).toStrictEqual(['directory a', 'staged a']);
  });

  it('ArrowLeft on the child moves focus to the directory, not the file', () => {
    const [result] = press({ focusedId: idOf('unstaged a/a.ts'), collapsedIds: new Set() }, [
      'ArrowLeft'
    ]);
    expect(describeId(result!.focusedId)).toBe('directory a');
  });

  it('ArrowLeft on the file does not touch the directory', () => {
    const [result] = press({ focusedId: idOf('staged a'), collapsedIds: new Set() }, ['ArrowLeft']);
    expect(describeId(result!.focusedId)).toBe('staged a');
    expect(result!.collapsedIds.size).toBe(0);
  });
});

describe('partially staged file', () => {
  const { rows, idOf, describeId, press } = setup({
    staged: [{ path: 'x.ts', kind: { status: 'modified' } }],
    unstaged: [
      { path: 'x.ts', kind: { status: 'modified' } },
      { path: 'y.ts', kind: { status: 'modified' } }
    ],
    untracked: []
  });

  it('keeps the staged and unstaged rows distinct', () => {
    expect(rows.map((n) => describeNode(n))).toStrictEqual([
      'staged x.ts',
      'unstaged x.ts',
      'unstaged y.ts'
    ]);
    expect(new Set(rows.map((n) => n.id)).size).toBe(3);
  });

  it('ArrowDown moves past both rows of the file', () => {
    const states = press({ focusedId: idOf('staged x.ts'), collapsedIds: new Set() }, [
      'ArrowDown',
      'ArrowDown',
      'ArrowDown'
    ]);
    expect(states.map((s) => describeId(s.focusedId))).toStrictEqual([
      'unstaged x.ts',
      'unstaged y.ts',
      'staged x.ts'
    ]);
  });
});
