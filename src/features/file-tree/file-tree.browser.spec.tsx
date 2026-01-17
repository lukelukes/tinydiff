import { SidebarProvider } from '#features/components/ui/sidebar';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { userEvent } from 'vitest/browser';

import type { DiffTarget, GitStatus } from '../../../tauri-bindings';

import { FileTree } from './file-tree';

function createStatus(files: { path: string; staged?: boolean }[]): GitStatus {
  return {
    staged: files
      .filter((f) => f.staged === true)
      .map((f) => ({ path: f.path, status: 'modified' as const, oldPath: null })),
    unstaged: files
      .filter((f) => f.staged !== true)
      .map((f) => ({ path: f.path, status: 'modified' as const, oldPath: null })),
    untracked: []
  };
}

function renderFileTree(props: {
  status: GitStatus;
  selectedFile: string | null;
  onSelectFile: (path: string, target: DiffTarget) => void;
}) {
  return render(
    <SidebarProvider>
      <FileTree {...props} />
    </SidebarProvider>
  );
}

describe('FileTree keyboard navigation', () => {
  it('Enter selects the focused file', async () => {
    const status = createStatus([{ path: 'src/app.tsx' }]);
    const onSelectFile = vi.fn();

    const screen = await renderFileTree({ status, selectedFile: null, onSelectFile });

    const container = screen.getByRole('list');
    await container.click();

    const fileButton = screen.getByText('app.tsx');
    await fileButton.click();

    onSelectFile.mockClear();

    await userEvent.keyboard('{Enter}');

    expect(onSelectFile).toHaveBeenCalledWith('src/app.tsx', expect.any(String));
  });

  it('Space selects the focused file', async () => {
    const status = createStatus([{ path: 'src/app.tsx' }]);
    const onSelectFile = vi.fn();

    const screen = await renderFileTree({ status, selectedFile: null, onSelectFile });

    const container = screen.getByRole('list');
    await container.click();

    const fileButton = screen.getByText('app.tsx');
    await fileButton.click();

    onSelectFile.mockClear();

    await userEvent.keyboard('{ }');

    expect(onSelectFile).toHaveBeenCalledWith('src/app.tsx', expect.any(String));
  });

  it('shows "No changes detected" when tree is empty', async () => {
    const status: GitStatus = { staged: [], unstaged: [], untracked: [] };
    const onSelectFile = vi.fn();

    const screen = await renderFileTree({ status, selectedFile: null, onSelectFile });

    const emptyMessage = screen.getByText('No changes detected');
    await expect.element(emptyMessage).toBeVisible();
  });

  it('clicking a file selects it', async () => {
    const status = createStatus([{ path: 'src/app.tsx' }, { path: 'src/lib/utils.ts' }]);
    const onSelectFile = vi.fn();

    const screen = await renderFileTree({ status, selectedFile: null, onSelectFile });

    const fileButton = screen.getByText('app.tsx');
    await fileButton.click();

    expect(onSelectFile).toHaveBeenCalledWith('src/app.tsx', 'unstaged');
  });

  it('displays file status badges', async () => {
    const status = createStatus([{ path: 'src/app.tsx' }]);
    const onSelectFile = vi.fn();

    const screen = await renderFileTree({ status, selectedFile: null, onSelectFile });

    const statusBadge = screen.getByText('M');
    await expect.element(statusBadge).toBeVisible();
  });

  it('renders folder structure correctly', async () => {
    const status = createStatus([{ path: 'src/app.tsx' }, { path: 'src/lib/utils.ts' }]);
    const onSelectFile = vi.fn();

    const screen = await renderFileTree({ status, selectedFile: null, onSelectFile });

    const srcFolder = screen.getByText('src');
    await expect.element(srcFolder).toBeVisible();

    const libFolder = screen.getByText('lib');
    await expect.element(libFolder).toBeVisible();

    const appFile = screen.getByText('app.tsx');
    await expect.element(appFile).toBeVisible();

    const utilsFile = screen.getByText('utils.ts');
    await expect.element(utilsFile).toBeVisible();
  });
});
