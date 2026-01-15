import React, { useMemo } from 'react';

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

import type { GitStatus, DiffTarget } from '../../../tauri-bindings';

import {
  buildFileTree,
  getStatusLabel,
  getStatusColorClass,
  type FileTreeNode
} from './tree-builder';

interface FileTreeProps {
  status: GitStatus;
  selectedFile: string | null;
  onSelectFile: (path: string, target: DiffTarget) => void;
}

export function FileTree({ status, selectedFile, onSelectFile }: FileTreeProps) {
  const tree = useMemo(() => buildFileTree(status), [status]);

  if (tree.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground">No changes detected</div>;
  }

  return (
    <SidebarMenu>
      {tree.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          selectedFile={selectedFile}
          onSelectFile={onSelectFile}
        />
      ))}
    </SidebarMenu>
  );
}

interface TreeItemProps {
  node: FileTreeNode;
  selectedFile: string | null;
  onSelectFile: (path: string, target: DiffTarget) => void;
}

const TreeItem = React.memo(function TreeItem({ node, selectedFile, onSelectFile }: TreeItemProps) {
  if (node.type === 'file') {
    const isSelected = selectedFile === node.path;
    const target: DiffTarget = node.isStaged ? 'staged' : 'unstaged';

    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={isSelected}
          onClick={() => onSelectFile(node.path, target)}
          className={node.isStaged ? 'opacity-100' : 'opacity-60'}
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
  return (
    <SidebarMenuItem>
      <Collapsible
        defaultOpen
        className="group/collapsible [&[data-open]>button>svg:first-child]:rotate-90"
      >
        <CollapsibleTrigger className="peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0">
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
              />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
});
