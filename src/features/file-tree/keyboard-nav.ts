import type { FileTreeNode } from './tree-builder';
import { flattenTree, nodeKey } from './tree-utils';

export type NavigationKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End';

export interface NavigationState {
  focusedKey: string | null;
  collapsedKeys: Set<string>;
}

export interface NavigationResult {
  focusedKey: string | null;
  collapsedKeys: Set<string>;
}

export function applyKeyboardNav(
  tree: FileTreeNode[],
  state: NavigationState,
  key: NavigationKey
): NavigationResult {
  const { focusedKey, collapsedKeys } = state;
  const flatNodes = flattenTree(tree, collapsedKeys);

  if (flatNodes.length === 0) {
    return state;
  }

  const currentIndex = focusedKey === null ? -1 : flatNodes.findIndex((f) => f.key === focusedKey);
  const currentFlat = currentIndex >= 0 ? flatNodes[currentIndex] : null;
  const move = (step: number) => {
    const nextIndex = (currentIndex + step + flatNodes.length) % flatNodes.length;
    return flatNodes[nextIndex]?.key ?? focusedKey;
  };

  switch (key) {
    case 'ArrowDown':
      return { focusedKey: move(1), collapsedKeys };
    case 'ArrowUp':
      return { focusedKey: move(-1), collapsedKeys };
    case 'Home':
      return { focusedKey: flatNodes[0]?.key ?? focusedKey, collapsedKeys };
    case 'End':
      return { focusedKey: flatNodes.at(-1)?.key ?? focusedKey, collapsedKeys };

    case 'ArrowRight': {
      if (!currentFlat || currentFlat.node.type !== 'directory') {
        return state;
      }

      if (collapsedKeys.has(currentFlat.key)) {
        const newCollapsed = new Set(collapsedKeys);
        newCollapsed.delete(currentFlat.key);
        return { focusedKey, collapsedKeys: newCollapsed };
      }
      const firstChild = currentFlat.node.children[0];
      return { focusedKey: firstChild ? nodeKey(firstChild) : focusedKey, collapsedKeys };
    }

    case 'ArrowLeft': {
      if (!currentFlat) {
        return state;
      }

      if (currentFlat.node.type === 'directory' && !collapsedKeys.has(currentFlat.key)) {
        return { focusedKey, collapsedKeys: new Set([...collapsedKeys, currentFlat.key]) };
      }
      return { focusedKey: currentFlat.parentKey ?? focusedKey, collapsedKeys };
    }
  }
}
