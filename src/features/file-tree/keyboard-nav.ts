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
    return { focusedPath, collapsedPaths };
  }

  const currentIndex =
    focusedPath === null ? -1 : flatNodes.findIndex((f) => f.node.path === focusedPath);
  const currentFlat = currentIndex >= 0 ? flatNodes[currentIndex] : null;

  switch (key) {
    case 'ArrowDown': {
      const nextIndex = currentIndex < flatNodes.length - 1 ? currentIndex + 1 : 0;
      const next = flatNodes[nextIndex];
      return { focusedPath: next?.node.path ?? focusedPath, collapsedPaths };
    }

    case 'ArrowUp': {
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : flatNodes.length - 1;
      const prev = flatNodes[prevIndex];
      return { focusedPath: prev?.node.path ?? focusedPath, collapsedPaths };
    }

    case 'ArrowRight': {
      if (!currentFlat || currentFlat.node.type !== 'directory') {
        return { focusedPath, collapsedPaths };
      }

      if (collapsedPaths.has(currentFlat.node.path)) {
        const newCollapsed = new Set(collapsedPaths);
        newCollapsed.delete(currentFlat.node.path);
        return { focusedPath, collapsedPaths: newCollapsed };
      } else if (currentFlat.node.children.length > 0) {
        const firstChild = currentFlat.node.children[0];
        return { focusedPath: firstChild?.path ?? focusedPath, collapsedPaths };
      }
      return { focusedPath, collapsedPaths };
    }

    case 'ArrowLeft': {
      if (!currentFlat) {
        return { focusedPath, collapsedPaths };
      }

      if (currentFlat.node.type === 'directory' && !collapsedPaths.has(currentFlat.node.path)) {
        return { focusedPath, collapsedPaths: new Set([...collapsedPaths, currentFlat.node.path]) };
      } else if (currentFlat.parentPath !== null) {
        return { focusedPath: currentFlat.parentPath, collapsedPaths };
      }
      return { focusedPath, collapsedPaths };
    }

    case 'Home': {
      const first = flatNodes[0];
      return { focusedPath: first?.node.path ?? focusedPath, collapsedPaths };
    }

    case 'End': {
      const last = flatNodes.at(-1);
      return { focusedPath: last?.node.path ?? focusedPath, collapsedPaths };
    }
  }
}
