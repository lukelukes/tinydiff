import { useState } from 'react';

import type { DiffTarget } from '../../../tauri-bindings';
import type { FileTreeNode } from './tree-builder';

interface FlatNode {
  node: FileTreeNode;
  depth: number;
  parentPath: string | null;
}

/**
 * Get all directory paths from a tree
 */
function getAllDirectoryPaths(nodes: FileTreeNode[]): Set<string> {
  const paths = new Set<string>();

  function walk(nodes: FileTreeNode[]) {
    for (const node of nodes) {
      if (node.type === 'directory') {
        paths.add(node.path);
        walk(node.children);
      }
    }
  }

  walk(nodes);
  return paths;
}

/**
 * Flatten tree nodes into a list, respecting expanded state.
 * Only includes nodes that are visible (parent directories are expanded).
 */
function flattenTree(
  nodes: FileTreeNode[],
  collapsedPaths: Set<string>,
  depth = 0,
  parentPath: string | null = null
): FlatNode[] {
  const result: FlatNode[] = [];

  for (const node of nodes) {
    result.push({ node, depth, parentPath });

    // Directory is expanded if NOT in the collapsed set
    if (node.type === 'directory' && !collapsedPaths.has(node.path)) {
      result.push(...flattenTree(node.children, collapsedPaths, depth + 1, node.path));
    }
  }

  return result;
}

interface UseFileTreeKeyboardOptions {
  tree: FileTreeNode[];
  onSelectFile: (path: string, target: DiffTarget) => void;
}

export function useFileTreeKeyboard({ tree, onSelectFile }: UseFileTreeKeyboardOptions) {
  // Track collapsed directories (inverted: all directories start expanded)
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(() => new Set());

  // Track focused item path (separate from selected)
  const [focusedPath, setFocusedPath] = useState<string | null>(null);

  // Compute expanded paths: all directories minus collapsed ones
  const allDirectories = getAllDirectoryPaths(tree);
  const expandedPaths = new Set([...allDirectories].filter((p) => !collapsedPaths.has(p)));

  // Get flattened visible nodes
  const flatNodes = flattenTree(tree, collapsedPaths);

  const toggleExpanded = (path: string) => {
    setCollapsedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path); // Was collapsed, now expand
      } else {
        next.add(path); // Was expanded, now collapse
      }
      return next;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (flatNodes.length === 0) return;

    const currentIndex =
      focusedPath === null ? -1 : flatNodes.findIndex((f) => f.node.path === focusedPath);

    const currentFlat = currentIndex >= 0 ? flatNodes[currentIndex] : null;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const nextIndex = currentIndex < flatNodes.length - 1 ? currentIndex + 1 : 0;
        const next = flatNodes[nextIndex];
        if (next) {
          setFocusedPath(next.node.path);
        }
        break;
      }

      case 'ArrowUp': {
        e.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : flatNodes.length - 1;
        const prev = flatNodes[prevIndex];
        if (prev) {
          setFocusedPath(prev.node.path);
        }
        break;
      }

      case 'ArrowRight': {
        e.preventDefault();
        if (!currentFlat) break;

        if (currentFlat.node.type === 'directory') {
          if (collapsedPaths.has(currentFlat.node.path)) {
            // Currently collapsed, expand it
            toggleExpanded(currentFlat.node.path);
          } else if (currentFlat.node.children.length > 0) {
            // Already expanded, move to first child
            const firstChild = currentFlat.node.children[0];
            if (firstChild) {
              setFocusedPath(firstChild.path);
            }
          }
        }
        break;
      }

      case 'ArrowLeft': {
        e.preventDefault();
        if (!currentFlat) break;

        if (currentFlat.node.type === 'directory' && !collapsedPaths.has(currentFlat.node.path)) {
          // Currently expanded, collapse it
          toggleExpanded(currentFlat.node.path);
        } else if (currentFlat.parentPath !== null) {
          // Move to parent directory
          setFocusedPath(currentFlat.parentPath);
        }
        break;
      }

      case 'Enter': {
        e.preventDefault();
        if (!currentFlat) break;

        if (currentFlat.node.type === 'file') {
          const target: DiffTarget = currentFlat.node.isStaged ? 'staged' : 'unstaged';
          onSelectFile(currentFlat.node.path, target);
        } else {
          // Toggle directory on Enter
          toggleExpanded(currentFlat.node.path);
        }
        break;
      }

      case ' ': {
        // Space also toggles directories
        e.preventDefault();
        if (!currentFlat) break;

        if (currentFlat.node.type === 'directory') {
          toggleExpanded(currentFlat.node.path);
        } else {
          const target: DiffTarget = currentFlat.node.isStaged ? 'staged' : 'unstaged';
          onSelectFile(currentFlat.node.path, target);
        }
        break;
      }

      case 'Home': {
        e.preventDefault();
        const first = flatNodes[0];
        if (first) {
          setFocusedPath(first.node.path);
        }
        break;
      }

      case 'End': {
        e.preventDefault();
        const last = flatNodes.at(-1);
        if (last) {
          setFocusedPath(last.node.path);
        }
        break;
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
