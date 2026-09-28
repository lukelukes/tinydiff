import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { userEvent } from 'vitest/browser';

import { SidebarProvider } from '#features/components/ui/sidebar';

import type { DiffTarget, GitStatus } from '../../../tauri-bindings';
import { FileTree } from './file-tree';

function createStatus(files: { path: string; staged?: boolean }[]): GitStatus {
  return {
    staged: files
      .filter((f) => f.staged === true)
      .map((f) => ({ path: f.path, kind: { status: 'modified' as const } })),
    unstaged: files
      .filter((f) => f.staged !== true)
      .map((f) => ({ path: f.path, kind: { status: 'modified' as const } })),
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
    const onSelectFile = vi.fn<(path: string, target: DiffTarget) => void>();

    const screen = await renderFileTree({ status, selectedFile: null, onSelectFile });

    const container = screen.getByRole('list', { name: 'Changed files' });
    await container.click();

    const fileButton = screen.getByText('app.tsx');
    await fileButton.click();

    onSelectFile.mockClear();

    await userEvent.keyboard('{Enter}');

    expect(onSelectFile).toHaveBeenCalledWith('src/app.tsx', expect.any(String));
  });

  it('Space selects the focused file', async () => {
    const status = createStatus([{ path: 'src/app.tsx' }]);
    const onSelectFile = vi.fn<(path: string, target: DiffTarget) => void>();

    const screen = await renderFileTree({ status, selectedFile: null, onSelectFile });

    const container = screen.getByRole('list', { name: 'Changed files' });
    await container.click();

    const fileButton = screen.getByText('app.tsx');
    await fileButton.click();

    onSelectFile.mockClear();

    await userEvent.keyboard('{ }');

    expect(onSelectFile).toHaveBeenCalledWith('src/app.tsx', expect.any(String));
  });

  it('shows "No changes detected" when tree is empty', async () => {
    const status: GitStatus = { staged: [], unstaged: [], untracked: [] };
    const onSelectFile = vi.fn<(path: string, target: DiffTarget) => void>();

    const screen = await renderFileTree({ status, selectedFile: null, onSelectFile });

    const emptyMessage = screen.getByText('No changes detected');
    await expect.element(emptyMessage).toBeVisible();
  });

  it('clicking a file selects it', async () => {
    const status = createStatus([{ path: 'src/app.tsx' }, { path: 'src/lib/utils.ts' }]);
    const onSelectFile = vi.fn<(path: string, target: DiffTarget) => void>();

    const screen = await renderFileTree({ status, selectedFile: null, onSelectFile });

    const fileButton = screen.getByText('app.tsx');
    await fileButton.click();

    expect(onSelectFile).toHaveBeenCalledWith('src/app.tsx', 'unstaged');
  });

  it('displays file status badges', async () => {
    const status = createStatus([{ path: 'src/app.tsx' }]);
    const onSelectFile = vi.fn<(path: string, target: DiffTarget) => void>();

    const screen = await renderFileTree({ status, selectedFile: null, onSelectFile });

    const statusBadge = screen.getByText('M');
    await expect.element(statusBadge).toBeVisible();
  });

  it('renders folder structure correctly', async () => {
    const status = createStatus([{ path: 'src/app.tsx' }, { path: 'src/lib/utils.ts' }]);
    const onSelectFile = vi.fn<(path: string, target: DiffTarget) => void>();

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

describe('FileTree rows that share a path', () => {
  it('keeps a file row when the directory with the same path collapses', async () => {
    const status: GitStatus = {
      staged: [{ path: 'a', kind: { status: 'deleted' } }],
      unstaged: [{ path: 'a/b.ts', kind: { status: 'added' } }],
      untracked: []
    };
    const onSelectFile = vi.fn<(path: string, target: DiffTarget) => void>();
    const screen = await renderFileTree({ status, selectedFile: null, onSelectFile });
    const fileRow = screen.getByRole('button', { name: /^a\s*D$/u });
    const childRow = screen.getByRole('button', { name: /^b\.ts\s*A$/u });

    await expect.element(fileRow).toBeVisible();
    await expect.element(childRow).toBeVisible();

    await screen.getByRole('button', { name: 'a', exact: true, expanded: true }).click();

    await expect
      .element(screen.getByRole('button', { name: 'a', exact: true, expanded: false }))
      .toBeVisible();
    await expect.element(childRow).not.toBeInTheDocument();
    await expect.element(fileRow).toBeVisible();

    await fileRow.click();
    await userEvent.keyboard('{Enter}');

    await expect.element(childRow).not.toBeInTheDocument();
    expect(onSelectFile.mock.calls).toStrictEqual([
      ['a', 'staged'],
      ['a', 'staged']
    ]);
  });

  it('drops the committed row of a partially staged file when the status refreshes', async () => {
    const onSelectFile = vi.fn<(path: string, target: DiffTarget) => void>();
    const screen = await renderFileTree({
      status: {
        staged: [{ path: 'src/app.ts', kind: { status: 'added' } }],
        unstaged: [{ path: 'src/app.ts', kind: { status: 'modified' } }],
        untracked: []
      },
      selectedFile: null,
      onSelectFile
    });

    await screen.rerender(
      <SidebarProvider>
        <FileTree
          status={{
            staged: [],
            unstaged: [
              { path: 'src/api.ts', kind: { status: 'modified' } },
              { path: 'src/app.ts', kind: { status: 'modified' } }
            ],
            untracked: []
          }}
          selectedFile={null}
          onSelectFile={onSelectFile}
        />
      </SidebarProvider>
    );

    await expect.element(screen.getByRole('button', { name: /^api\.ts\s*M$/u })).toBeVisible();
    expect(screen.getByRole('button', { name: /^app\.ts/u }).all()).toHaveLength(1);
  });

  it.for([
    { row: 'staged', badge: 'A', key: '{Enter}', target: 'staged' },
    { row: 'staged', badge: 'A', key: '{ }', target: 'staged' },
    { row: 'unstaged', badge: 'M', key: '{Enter}', target: 'unstaged' },
    { row: 'unstaged', badge: 'M', key: '{ }', target: 'unstaged' }
  ] as const)(
    'selects the $row row of a partially staged file on click and then on $key',
    async ({ badge, key, target }) => {
      const status: GitStatus = {
        staged: [{ path: 'src/app.ts', kind: { status: 'added' } }],
        unstaged: [{ path: 'src/app.ts', kind: { status: 'modified' } }],
        untracked: []
      };
      const onSelectFile = vi.fn<(path: string, target: DiffTarget) => void>();
      const screen = await renderFileTree({ status, selectedFile: null, onSelectFile });
      expect(screen.getByRole('button', { name: /^app\.ts/u }).all()).toHaveLength(2);

      await screen.getByRole('button', { name: new RegExp(`^app\\.ts\\s*${badge}$`, 'u') }).click();
      await userEvent.keyboard(key);

      expect(onSelectFile.mock.calls).toStrictEqual([
        ['src/app.ts', target],
        ['src/app.ts', target]
      ]);
    }
  );
});
