import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { DiffTarget } from '../../../tauri-bindings';
import type { FileTreeNode } from './tree-builder';

interface FlatNode {
  node: FileTreeNode;
  depth: number;
  parentPath: string | null;
}

/**
 * Flatten tree nodes into a list, respecting expanded state.
 * Only includes nodes that are visible (parent directories are expanded).
 */
function flattenTree(
  nodes: FileTreeNode[],
  expandedPaths: Set<string>,
  depth = 0,
  parentPath: string | null = null
): FlatNode[] {
  const result: FlatNode[] = [];

  for (const node of nodes) {
    result.push({ node, depth, parentPath });

    if (node.type === 'directory' && expandedPaths.has(node.path)) {
      result.push(...flattenTree(node.children, expandedPaths, depth + 1, node.path));
    }
  }

  return result;
}

/**
 * Get all directory paths from a tree (for initializing all as expanded)
 */
function getAllDirectoryPaths(nodes: FileTreeNode[]): string[] {
  const paths: string[] = [];

  for (const node of nodes) {
    if (node.type === 'directory') {
      paths.push(node.path);
      paths.push(...getAllDirectoryPaths(node.children));
    }
  }

  return paths;
}

interface UseFileTreeKeyboardOptions {
  tree: FileTreeNode[];
  selectedFile: string | null;
  onSelectFile: (path: string, target: DiffTarget) => void;
}

export function useFileTreeKeyboard({
  tree,
  selectedFile,
  onSelectFile
}: UseFileTreeKeyboardOptions) {
  // Track which directories are expanded (all expanded by default)
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    return new Set(getAllDirectoryPaths(tree));
  });

  // Track focused item path (separate from selected)
  const [focusedPath, setFocusedPath] = useState<string | null>(null);

  // Update expanded paths when tree changes (new files added, etc.)
  useEffect(() => {
    setExpandedPaths((prev) => {
      const newPaths = getAllDirectoryPaths(tree);
      const updated = new Set(prev);
      for (const path of newPaths) {
        if (!prev.has(path)) {
          updated.add(path);
        }
      }
      return updated;
    });
  }, [tree]);

  // Get flattened visible nodes
  const flatNodes = useMemo(() => flattenTree(tree, expandedPaths), [tree, expandedPaths]);

  const toggleExpanded = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
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
            if (!expandedPaths.has(currentFlat.node.path)) {
              // Expand the directory
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

          if (currentFlat.node.type === 'directory' && expandedPaths.has(currentFlat.node.path)) {
            // Collapse the directory
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
    },
    [flatNodes, focusedPath, expandedPaths, onSelectFile, toggleExpanded]
  );

  // When selected file changes externally, update focus to match
  useEffect(() => {
    if (selectedFile !== null && flatNodes.some((f) => f.node.path === selectedFile)) {
      setFocusedPath(selectedFile);
    }
  }, [selectedFile, flatNodes]);

  return {
    focusedPath,
    setFocusedPath,
    expandedPaths,
    toggleExpanded,
    handleKeyDown
  };
}
