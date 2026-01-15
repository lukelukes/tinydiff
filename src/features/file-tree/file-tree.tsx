import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '#features/components/ui/collapsible';
import {
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub
} from '#features/components/ui/sidebar';
import { ChevronRight, File, Folder } from 'lucide-react';
import React, { useMemo, useRef, useEffect, useCallback } from 'react';

import type { GitStatus, DiffTarget } from '../../../tauri-bindings';

import {
  buildFileTree,
  getStatusLabel,
  getStatusColorClass,
  type FileTreeNode
} from './tree-builder';
import { useFileTreeKeyboard } from './use-file-tree-keyboard';

interface FileTreeProps {
  status: GitStatus;
  selectedFile: string | null;
  onSelectFile: (path: string, target: DiffTarget) => void;
}

export function FileTree({ status, selectedFile, onSelectFile }: FileTreeProps) {
  const tree = useMemo(() => buildFileTree(status), [status]);
  const containerRef = useRef<HTMLUListElement>(null);

  const { focusedPath, setFocusedPath, isExpanded, toggleExpanded, handleKeyDown } =
    useFileTreeKeyboard({
      tree,
      selectedFile,
      onSelectFile
    });

  // Focus the container when focusedPath changes
  useEffect(() => {
    if (focusedPath !== null && containerRef.current !== null) {
      containerRef.current.focus();
    }
  }, [focusedPath]);

  if (tree.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground">No changes detected</div>;
  }

  return (
    <SidebarMenu
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="outline-none focus:ring-1 focus:ring-sidebar-ring focus:ring-inset"
    >
      {tree.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          selectedFile={selectedFile}
          onSelectFile={onSelectFile}
          focusedPath={focusedPath}
          setFocusedPath={setFocusedPath}
          isExpanded={isExpanded}
          toggleExpanded={toggleExpanded}
        />
      ))}
    </SidebarMenu>
  );
}

interface TreeItemProps {
  node: FileTreeNode;
  selectedFile: string | null;
  onSelectFile: (path: string, target: DiffTarget) => void;
  focusedPath: string | null;
  setFocusedPath: (path: string | null) => void;
  isExpanded: (path: string) => boolean;
  toggleExpanded: (path: string) => void;
}

const TreeItem = React.memo(function TreeItem({
  node,
  selectedFile,
  onSelectFile,
  focusedPath,
  setFocusedPath,
  isExpanded,
  toggleExpanded
}: TreeItemProps) {
  const isFocused = focusedPath === node.path;

  const handleClick = useCallback(() => {
    setFocusedPath(node.path);
    if (node.type === 'file') {
      const target: DiffTarget = node.isStaged ? 'staged' : 'unstaged';
      onSelectFile(node.path, target);
    }
  }, [node, onSelectFile, setFocusedPath]);

  const handleDirectoryClick = useCallback(() => {
    setFocusedPath(node.path);
  }, [node.path, setFocusedPath]);

  const handleToggle = useCallback(
    (open: boolean) => {
      if (open !== isExpanded(node.path)) {
        toggleExpanded(node.path);
      }
    },
    [node.path, isExpanded, toggleExpanded]
  );

  if (node.type === 'file') {
    const isSelected = selectedFile === node.path;

    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={isSelected}
          onClick={handleClick}
          className={`${node.isStaged ? 'opacity-100' : 'opacity-60'} ${isFocused && !isSelected ? 'ring-1 ring-inset ring-sidebar-ring' : ''}`}
          tabIndex={-1}
        >
          <File className="size-4" />
          <span className="truncate">{node.name}</span>
        </SidebarMenuButton>
        {node.status && (
          <SidebarMenuBadge className={getStatusColorClass(node.status)}>
            {getStatusLabel(node.status)}
          </SidebarMenuBadge>
        )}
      </SidebarMenuItem>
    );
  }

  // Directory node
  const expanded = isExpanded(node.path);

  return (
    <SidebarMenuItem>
      <Collapsible
        open={expanded}
        onOpenChange={handleToggle}
        className="group/collapsible [&[data-open]>button>svg:first-child]:rotate-90"
      >
        <CollapsibleTrigger
          onClick={handleDirectoryClick}
          className={`peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 ${isFocused ? 'ring-1 ring-inset' : ''}`}
          tabIndex={-1}
        >
          <ChevronRight className="size-4 transition-transform" />
          <Folder className="size-4 text-yellow-500" />
          <span>{node.name}</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {node.children.map((child) => (
              <TreeItem
                key={child.path}
                node={child}
                selectedFile={selectedFile}
                onSelectFile={onSelectFile}
                focusedPath={focusedPath}
                setFocusedPath={setFocusedPath}
                isExpanded={isExpanded}
                toggleExpanded={toggleExpanded}
              />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
});
