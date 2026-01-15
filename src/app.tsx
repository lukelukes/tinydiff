import type { AppMode } from '#core/app-mode';

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarProvider
} from '#features/components/ui/sidebar';
import { FileTree, useGitStatus } from '#features/file-tree';
import { useCallback, useState } from 'react';

import type { CommandError, DiffTarget } from '../tauri-bindings';

import './app.css';

function getErrorMessage(error: CommandError): string {
  switch (error.type) {
    case 'path':
      return error.message;
    case 'utf8':
      return `UTF-8 encoding error for ${error.path}`;
    case 'git':
      return error.message;
  }
}

function EmptyMode() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
      <h2 className="mb-6 text-xl font-medium text-foreground">Welcome to TinyDiff</h2>
      <div className="space-y-4 text-sm">
        <div>
          <code className="rounded bg-muted px-2 py-1">td .</code>
          <span className="ml-3">View git changes in current directory</span>
        </div>
        <div>
          <code className="rounded bg-muted px-2 py-1">td file1 file2</code>
          <span className="ml-3">Compare two files</span>
        </div>
      </div>
    </div>
  );
}

function GitMode({ path }: { path: string }) {
  const { state } = useGitStatus(path);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [_selectedTarget, setSelectedTarget] = useState<DiffTarget | null>(null);

  const handleSelectFile = useCallback((filePath: string, target: DiffTarget) => {
    setSelectedFile(filePath);
    setSelectedTarget(target);
  }, []);

  if (state.status === 'loading') {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        Loading git status...
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
        <p className="text-destructive">Error loading git status</p>
        <p className="mt-2 text-sm">{getErrorMessage(state.error)}</p>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="none">
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Changes</SidebarGroupLabel>
            <SidebarGroupContent>
              <FileTree
                status={state.data}
                selectedFile={selectedFile}
                onSelectFile={handleSelectFile}
              />
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          {selectedFile ? (
            <p>Diff view for {selectedFile} coming soon</p>
          ) : (
            <p>Select a file to view diff</p>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function FileMode({ fileA, fileB }: { fileA: string; fileB: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
      <p>File comparison mode</p>
      <p className="mt-2 text-sm">
        Comparing: {fileA} vs {fileB}
      </p>
      <p className="mt-2 text-sm">(Diff view coming soon)</p>
    </div>
  );
}

function ModeContent({ mode }: { mode: AppMode }) {
  switch (mode.type) {
    case 'empty':
      return <EmptyMode />;
    case 'git':
      return <GitMode path={mode.path} />;
    case 'file':
      return <FileMode fileA={mode.fileA} fileB={mode.fileB} />;
    default:
      return mode satisfies never;
  }
}

function App({ mode }: { mode: AppMode }) {
  return (
    <div className="flex h-full w-full flex-col bg-background text-foreground">
      <ModeContent mode={mode} />
    </div>
  );
}

export default App;
