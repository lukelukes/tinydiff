import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '#features/components/ui/collapsible';
import {
  SidebarMenu,
  SidebarMenuButton,
  sidebarMenuButtonVariants,
  SidebarMenuItem,
  SidebarMenuSub
} from '#features/components/ui/sidebar';
import {
  ArrowRight01Icon,
  File01Icon,
  Folder01Icon,
  FolderOpenIcon
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useRef } from 'react';

import type { GitStatus, DiffTarget } from '../../../tauri-bindings';

import { buildFileTree, getStatusLabel, type FileTreeNode } from './tree-builder';
import { useFileTreeKeyboard } from './use-file-tree-keyboard';

interface FileTreeProps {
  status: GitStatus;
  selectedFile: string | null;
  onSelectFile: (path: string, target: DiffTarget) => void;
}

export function FileTree({ status, selectedFile, onSelectFile }: FileTreeProps) {
  const tree = buildFileTree(status);
  const containerRef = useRef<HTMLUListElement>(null);

  const { focusedPath, setFocusedPath, expandedPaths, toggleExpanded, handleKeyDown } =
    useFileTreeKeyboard({
      tree,
      onSelectFile
    });

  // Wrap keyboard handler to ensure container stays focused during navigation
  const onKeyDown = (e: React.KeyboardEvent) => {
    handleKeyDown(e);
    // Keep focus on container for continued keyboard navigation
    containerRef.current?.focus();
  };

  if (tree.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground">No changes detected</div>;
  }

  return (
    <SidebarMenu ref={containerRef} tabIndex={0} onKeyDown={onKeyDown} className="outline-none">
      {tree.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          selectedFile={selectedFile}
          onSelectFile={onSelectFile}
          focusedPath={focusedPath}
          setFocusedPath={setFocusedPath}
          expanded={node.type === 'directory' ? expandedPaths.has(node.path) : false}
          expandedPaths={expandedPaths}
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
  expanded: boolean;
  expandedPaths: Set<string>;
  toggleExpanded: (path: string) => void;
}

function TreeItem({
  node,
  selectedFile,
  onSelectFile,
  focusedPath,
  setFocusedPath,
  expanded,
  expandedPaths,
  toggleExpanded
}: TreeItemProps) {
  const isFocused = focusedPath === node.path;

  const handleClick = () => {
    setFocusedPath(node.path);
    if (node.type === 'file') {
      const target: DiffTarget = node.isStaged ? 'staged' : 'unstaged';
      onSelectFile(node.path, target);
    }
  };

  const handleToggle = () => {
    setFocusedPath(node.path);
    toggleExpanded(node.path);
  };

  if (node.type === 'file') {
    const isSelected = selectedFile === node.path;

    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={isSelected}
          onClick={handleClick}
          data-focused={isFocused && !isSelected}
          className={`group/file transition-all duration-150 ${node.isStaged ? 'opacity-100' : 'opacity-80 hover:opacity-100'}`}
          tabIndex={-1}
        >
          <HugeiconsIcon
            icon={File01Icon}
            size={14}
            className="shrink-0 text-muted-foreground group-hover/file:text-muted-foreground transition-colors"
          />
          <span className="flex-1 truncate text-sm">{node.name}</span>
          {node.kind && (
            <span
              className="ml-2 shrink-0 text-2xs font-semibold"
              style={{
                color: `var(--git-${node.kind.status === 'typechange' ? 'renamed' : node.kind.status})`
              }}
            >
              {getStatusLabel(node.kind.status)}
            </span>
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  // Directory node - use the pre-computed `expanded` prop
  return (
    <SidebarMenuItem>
      <Collapsible
        open={expanded}
        onOpenChange={handleToggle}
        className="group/collapsible [&[data-state=open]>button>svg:first-child]:rotate-90"
      >
        <CollapsibleTrigger
          data-focused={isFocused}
          className={sidebarMenuButtonVariants({ className: 'group/folder' })}
          tabIndex={-1}
        >
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            size={14}
            className="shrink-0 text-muted-foreground transition-transform"
          />
          <HugeiconsIcon
            icon={expanded ? FolderOpenIcon : Folder01Icon}
            size={14}
            className="shrink-0 text-icon-folder"
          />
          <span>{node.name}</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="pl-5">
            {node.children.map((child) => (
              <TreeItem
                key={child.path}
                node={child}
                selectedFile={selectedFile}
                onSelectFile={onSelectFile}
                focusedPath={focusedPath}
                setFocusedPath={setFocusedPath}
                expanded={child.type === 'directory' ? expandedPaths.has(child.path) : false}
                expandedPaths={expandedPaths}
                toggleExpanded={toggleExpanded}
              />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}
