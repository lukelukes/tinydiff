import type { FileTreeNode } from './tree-builder';

import { flattenTree } from './tree-utils';

export type NavigationKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End';

export interface NavigationState {
  focusedPath: string | null;
  collapsedPaths: Set<string>;
}

export interface NavigationResult {
  focusedPath: string | null;
  collapsedPaths: Set<string>;
}

export function applyKeyboardNav(
  tree: FileTreeNode[],
  state: NavigationState,
  key: NavigationKey
): NavigationResult {
  const { focusedPath, collapsedPaths } = state;
  const flatNodes = flattenTree(tree, collapsedPaths);

  if (flatNodes.length === 0) {
    return state;
  }

  const currentIndex =
    focusedPath === null ? -1 : flatNodes.findIndex((f) => f.node.path === focusedPath);
  const currentFlat = currentIndex >= 0 ? flatNodes[currentIndex] : null;
  const move = (step: number) => {
    const nextIndex = (currentIndex + step + flatNodes.length) % flatNodes.length;
    return flatNodes[nextIndex]?.node.path ?? focusedPath;
  };

  switch (key) {
    case 'ArrowDown':
      return { focusedPath: move(1), collapsedPaths };
    case 'ArrowUp':
      return { focusedPath: move(-1), collapsedPaths };
    case 'Home':
      return { focusedPath: flatNodes[0]?.node.path ?? focusedPath, collapsedPaths };
    case 'End':
      return { focusedPath: flatNodes.at(-1)?.node.path ?? focusedPath, collapsedPaths };

    case 'ArrowRight': {
      if (!currentFlat || currentFlat.node.type !== 'directory') {
        return state;
      }

      if (collapsedPaths.has(currentFlat.node.path)) {
        const newCollapsed = new Set(collapsedPaths);
        newCollapsed.delete(currentFlat.node.path);
        return { focusedPath, collapsedPaths: newCollapsed };
      }
      return { focusedPath: currentFlat.node.children[0]?.path ?? focusedPath, collapsedPaths };
    }

    case 'ArrowLeft': {
      if (!currentFlat) {
        return state;
      }

      if (currentFlat.node.type === 'directory' && !collapsedPaths.has(currentFlat.node.path)) {
        return { focusedPath, collapsedPaths: new Set([...collapsedPaths, currentFlat.node.path]) };
      }
      return { focusedPath: currentFlat.parentPath ?? focusedPath, collapsedPaths };
    }
  }
}
