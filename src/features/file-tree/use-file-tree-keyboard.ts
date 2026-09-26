import { useState } from 'react';

import type { DiffTarget } from '../../../tauri-bindings';
import { applyKeyboardNav, type NavigationKey } from './keyboard-nav';
import type { FileTreeNode } from './tree-builder';
import { flattenTree } from './tree-utils';

interface UseFileTreeKeyboardOptions {
  tree: FileTreeNode[];
  onSelectFile: (path: string, target: DiffTarget) => void;
}

export function useFileTreeKeyboard({ tree, onSelectFile }: UseFileTreeKeyboardOptions) {
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const flatNodes = flattenTree(tree, collapsedIds);
  const focusedNode =
    focusedId === null ? undefined : flatNodes.find((f) => f.node.id === focusedId)?.node;

  const toggleExpanded = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleNavigation = (key: NavigationKey) => {
    const result = applyKeyboardNav(tree, { focusedId, collapsedIds }, key);
    if (result.focusedId !== focusedId) setFocusedId(result.focusedId);
    if (result.collapsedIds !== collapsedIds) setCollapsedIds(result.collapsedIds);
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
        if (focusedNode.type === 'directory') {
          toggleExpanded(focusedNode.id);
        } else {
          onSelectFile(focusedNode.path, focusedNode.target);
        }
      }
    }
  };

  return {
    focusedId,
    setFocusedId,
    collapsedIds,
    toggleExpanded,
    handleKeyDown
  };
}
