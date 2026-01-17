import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import type { DiffFile } from '../../../tauri-bindings';

import { DiffViewer } from './diff-viewer';

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
    const screen = await render(
      <DiffViewer oldFile={null} newFile={null} isLoading={true} error={null} />
    );

    const loadingText = screen.getByText('Loading diff', { exact: false });
    await expect.element(loadingText).toBeVisible();
  });

  it('renders error state correctly', async () => {
    const screen = await render(
      <DiffViewer oldFile={null} newFile={null} isLoading={false} error="Failed" />
    );

    const errorText = screen.getByText('Failed');
    await expect.element(errorText).toBeVisible();
  });

  it('renders empty state correctly', async () => {
    const screen = await render(
      <DiffViewer oldFile={null} newFile={null} isLoading={false} error={null} />
    );

    const emptyText = screen.getByText('Select a file', { exact: false });
    await expect.element(emptyText).toBeVisible();
  });

  it('renders binary file state correctly', async () => {
    const oldFile = createBinaryFile('image.png', 1024);
    const newFile = createBinaryFile('image.png', 2048);

    const screen = await render(
      <DiffViewer oldFile={oldFile} newFile={newFile} isLoading={false} error={null} />
    );

    const binaryText = screen.getByText('Binary content');
    await expect.element(binaryText).toBeVisible();

    const sizeText = screen.getByText('.png', { exact: false });
    await expect.element(sizeText).toBeVisible();
  });

  it('retry button calls onRetry on error', async () => {
    const onRetry = vi.fn();

    const screen = await render(
      <DiffViewer
        oldFile={null}
        newFile={null}
        isLoading={false}
        error="Something went wrong"
        onRetry={onRetry}
      />
    );

    const retryButton = screen.getByRole('button', { name: /try again/i });
    await expect.element(retryButton).toBeVisible();

    await retryButton.click();

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('does not show retry button when onRetry is not provided', async () => {
    const screen = await render(
      <DiffViewer oldFile={null} newFile={null} isLoading={false} error="Something went wrong" />
    );

    const errorText = screen.getByText('Something went wrong');
    await expect.element(errorText).toBeVisible();

    const retryButton = screen.getByRole('button', { name: /try again/i });
    await expect.element(retryButton).not.toBeInTheDocument();
  });

  it('renders diff content for text files', async () => {
    const oldFile = createTextFile('test.ts', 'const x = 1;');
    const newFile = createTextFile('test.ts', 'const x = 2;');

    const screen = await render(
      <DiffViewer oldFile={oldFile} newFile={newFile} isLoading={false} error={null} />
    );

    await expect.poll(() => screen.getByText('test.ts').element()).toBeTruthy();
  });

  it('shows empty state when both files are null', async () => {
    const screen = await render(
      <DiffViewer oldFile={null} newFile={null} isLoading={false} error={null} />
    );

    const emptyText = screen.getByText('Select a file to view diff');
    await expect.element(emptyText).toBeVisible();
  });
});
