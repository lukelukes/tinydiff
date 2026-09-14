import { useState } from 'react';

import type { DiffTarget } from '../../../tauri-bindings';
import { applyKeyboardNav, type NavigationKey } from './keyboard-nav';
import type { FileTreeNode } from './tree-builder';
import { flattenTree, getAllDirectoryKeys } from './tree-utils';

interface UseFileTreeKeyboardOptions {
  tree: FileTreeNode[];
  onSelectFile: (path: string, target: DiffTarget) => void;
}

export function useFileTreeKeyboard({ tree, onSelectFile }: UseFileTreeKeyboardOptions) {
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(() => new Set());
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const allDirectories = getAllDirectoryKeys(tree);
  const expandedKeys = new Set([...allDirectories].filter((k) => !collapsedKeys.has(k)));
  const flatNodes = flattenTree(tree, collapsedKeys);
  const focusedNode = focusedKey === null ? undefined : flatNodes.find((f) => f.key === focusedKey);

  const toggleExpanded = (key: string) => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectFocusedFile = () => {
    if (!focusedNode || focusedNode.node.type !== 'file') return;
    const target: DiffTarget = focusedNode.node.isStaged ? 'staged' : 'unstaged';
    onSelectFile(focusedNode.node.path, target);
  };

  const handleNavigation = (key: NavigationKey) => {
    const result = applyKeyboardNav(tree, { focusedKey, collapsedKeys }, key);
    if (result.focusedKey !== focusedKey) setFocusedKey(result.focusedKey);
    if (result.collapsedKeys !== collapsedKeys) setCollapsedKeys(result.collapsedKeys);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (flatNodes.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'ArrowRight':
      case 'ArrowLeft':
      case 'Home':
      case 'End': {
        e.preventDefault();
        handleNavigation(e.key);
        return;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        if (!focusedNode) return;
        if (focusedNode.node.type === 'directory') {
          toggleExpanded(focusedNode.key);
        } else {
          selectFocusedFile();
        }
      }
    }
  };

  return {
    focusedKey,
    setFocusedKey,
    expandedKeys,
    toggleExpanded,
    handleKeyDown
  };
}
