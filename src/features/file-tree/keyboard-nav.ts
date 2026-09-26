import type { FileTreeNode } from './tree-builder';
import { flattenTree } from './tree-utils';

export type NavigationKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End';

export interface NavigationState {
  focusedId: string | null;
  collapsedIds: ReadonlySet<string>;
}

export function applyKeyboardNav(
  tree: FileTreeNode[],
  state: NavigationState,
  key: NavigationKey
): NavigationState {
  const { focusedId, collapsedIds } = state;
  const flatNodes = flattenTree(tree, collapsedIds);

  if (flatNodes.length === 0) {
    return state;
  }

  const currentIndex =
    focusedId === null ? -1 : flatNodes.findIndex((f) => f.node.id === focusedId);
  const currentFlat = currentIndex >= 0 ? flatNodes[currentIndex] : null;
  const move = (step: number) => {
    const nextIndex = (currentIndex + step + flatNodes.length) % flatNodes.length;
    return flatNodes[nextIndex]?.node.id ?? focusedId;
  };

  switch (key) {
    case 'ArrowDown':
      return { focusedId: move(1), collapsedIds };
    case 'ArrowUp':
      return { focusedId: move(-1), collapsedIds };
    case 'Home':
      return { focusedId: flatNodes[0]?.node.id ?? focusedId, collapsedIds };
    case 'End':
      return { focusedId: flatNodes.at(-1)?.node.id ?? focusedId, collapsedIds };

    case 'ArrowRight': {
      if (!currentFlat || currentFlat.node.type !== 'directory') {
        return state;
      }

      if (collapsedIds.has(currentFlat.node.id)) {
        const newCollapsed = new Set(collapsedIds);
        newCollapsed.delete(currentFlat.node.id);
        return { focusedId, collapsedIds: newCollapsed };
      }
      return { focusedId: currentFlat.node.children[0]?.id ?? focusedId, collapsedIds };
    }

    case 'ArrowLeft': {
      if (!currentFlat) {
        return state;
      }

      if (currentFlat.node.type === 'directory' && !collapsedIds.has(currentFlat.node.id)) {
        return { focusedId, collapsedIds: new Set([...collapsedIds, currentFlat.node.id]) };
      }
      return { focusedId: currentFlat.parentId ?? focusedId, collapsedIds };
    }
  }
}
