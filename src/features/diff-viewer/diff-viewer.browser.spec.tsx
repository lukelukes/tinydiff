import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import type { DiffFile } from '#bindings/index';

import { DiffViewer } from './diff-viewer';
import type { GitFileContentsState } from './use-git-file-contents';

const loading: GitFileContentsState = { status: 'loading' };
const idle: GitFileContentsState = { status: 'idle' };

function errorState(message: string): GitFileContentsState {
  return { status: 'error', error: { type: 'git', path: '', message } };
}

function successState(oldFile: DiffFile, newFile: DiffFile): GitFileContentsState {
  return { status: 'success', data: { oldFile, newFile } };
}

function createTextFile(name: string, content: string): DiffFile {
  return {
    name,
    lang: 'typescript',
    content: { type: 'text', contents: content }
  };
}

function createBinaryFile(name: string, size: number): DiffFile {
  return {
    name,
    lang: null,
    content: { type: 'binary', size }
  };
}

describe('DiffViewer', () => {
  it('renders loading state correctly', async () => {
    const screen = await render(<DiffViewer state={loading} />);

    const loadingText = screen.getByText('Loading diff', { exact: false });
    await expect.element(loadingText).toBeVisible();
  });

  it('renders error state correctly', async () => {
    const screen = await render(<DiffViewer state={errorState('Failed')} />);

    const errorText = screen.getByText('Failed');
    await expect.element(errorText).toBeVisible();
  });

  it('renders empty state correctly', async () => {
    const screen = await render(<DiffViewer state={idle} />);

    const emptyText = screen.getByText('Select a file', { exact: false });
    await expect.element(emptyText).toBeVisible();
  });

  it('renders binary file state correctly', async () => {
    const oldFile = createBinaryFile('image.png', 1024);
    const newFile = createBinaryFile('image.png', 2048);

    const screen = await render(<DiffViewer state={successState(oldFile, newFile)} />);

    const binaryText = screen.getByText('Binary content');
    await expect.element(binaryText).toBeVisible();

    const sizeText = screen.getByText('.png', { exact: false });
    await expect.element(sizeText).toBeVisible();
  });

  it('retry button calls onRetry on error', async () => {
    const onRetry = vi.fn<() => void>();

    const screen = await render(
      <DiffViewer state={errorState('Something went wrong')} onRetry={onRetry} />
    );

    const retryButton = screen.getByRole('button', { name: /try again/iu });
    await expect.element(retryButton).toBeVisible();

    await retryButton.click();

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('does not show retry button when onRetry is not provided', async () => {
    const screen = await render(<DiffViewer state={errorState('Something went wrong')} />);

    const errorText = screen.getByText('Something went wrong');
    await expect.element(errorText).toBeVisible();

    const retryButton = screen.getByRole('button', { name: /try again/iu });
    await expect.element(retryButton).not.toBeInTheDocument();
  });

  it('renders diff content for text files', async () => {
    const oldFile = createTextFile('test.ts', 'const x = 1;');
    const newFile = createTextFile('test.ts', 'const x = 2;');

    const screen = await render(<DiffViewer state={successState(oldFile, newFile)} />);

    await expect.poll(() => screen.getByText('test.ts').element()).toBeTruthy();
  });

  it('virtualizes long diffs', async () => {
    const lines = Array.from({ length: 3000 }, (_, i) => `const line${i} = ${i};`);
    const oldFile = createTextFile('long.ts', lines.join('\n'));
    const newFile = createTextFile('long.ts', lines.map((line) => `${line} // changed`).join('\n'));

    const screen = await render(
      <div style={{ height: 400, display: 'flex', flexDirection: 'column' }}>
        <DiffViewer state={successState(oldFile, newFile)} />
      </div>
    );

    const countText = (text: string) => screen.getByText(text, { exact: false }).elements().length;

    await expect.poll(() => countText('line0 '), { timeout: 20000 }).toBeGreaterThan(0);
    expect(countText('line2990')).toBe(0);

    const scroller = screen.container.querySelector<HTMLElement>('.overflow-auto');
    expect(scroller).not.toBeNull();
    scroller!.scrollTop = scroller!.scrollHeight;

    await expect.poll(() => countText('line2990'), { timeout: 20000 }).toBeGreaterThan(0);
  }, 60000);

  it('shows empty state when both files are null', async () => {
    const screen = await render(<DiffViewer state={idle} />);

    const emptyText = screen.getByText('Select a file to view diff');
    await expect.element(emptyText).toBeVisible();
  });
});
