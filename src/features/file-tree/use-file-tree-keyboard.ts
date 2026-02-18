import { useState } from 'react';

import type { DiffTarget } from '../../../tauri-bindings';
import type { FileTreeNode } from './tree-builder';

import { applyKeyboardNav, type NavigationKey } from './keyboard-nav';
import { flattenTree, getAllDirectoryPaths } from './tree-utils';

interface UseFileTreeKeyboardOptions {
  tree: FileTreeNode[];
  onSelectFile: (path: string, target: DiffTarget) => void;
}

export function useFileTreeKeyboard({ tree, onSelectFile }: UseFileTreeKeyboardOptions) {
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(() => new Set());
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const allDirectories = getAllDirectoryPaths(tree);
  const expandedPaths = new Set([...allDirectories].filter((p) => !collapsedPaths.has(p)));
  const flatNodes = flattenTree(tree, collapsedPaths);
  const focusedNode =
    focusedPath === null ? undefined : flatNodes.find((f) => f.node.path === focusedPath);

  const toggleExpanded = (path: string) => {
    setCollapsedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
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
    const result = applyKeyboardNav(tree, { focusedPath, collapsedPaths }, key);
    if (result.focusedPath !== focusedPath) setFocusedPath(result.focusedPath);
    if (result.collapsedPaths !== collapsedPaths) setCollapsedPaths(result.collapsedPaths);
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
          toggleExpanded(focusedNode.node.path);
        } else {
          selectFocusedFile();
        }
      }
    }
  };

  return {
    focusedPath,
    setFocusedPath,
    expandedPaths,
    toggleExpanded,
    handleKeyDown
  };
}
