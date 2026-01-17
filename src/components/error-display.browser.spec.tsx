import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { ErrorDisplay } from './error-display';

describe('ErrorDisplay', () => {
  it('renders error title and message', async () => {
    const error = new Error('Something went wrong');

    const screen = await render(<ErrorDisplay title="Test Error" error={error} />);

    const title = screen.getByText('Test Error');
    await expect.element(title).toBeVisible();

    const message = screen.getByText('Something went wrong');
    await expect.element(message).toBeVisible();
  });

  it('shows retry button when onRetry is provided', async () => {
    const error = new Error('Failed');
    const onRetry = vi.fn();

    const screen = await render(<ErrorDisplay title="Error" error={error} onRetry={onRetry} />);

    const retryButton = screen.getByRole('button', { name: /retry/i });
    await expect.element(retryButton).toBeVisible();

    await retryButton.click();

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('does not show retry button when onRetry is not provided', async () => {
    const error = new Error('Failed');

    const screen = await render(<ErrorDisplay title="Error" error={error} />);

    const retryButton = screen.getByRole('button', { name: /retry/i });
    await expect.element(retryButton).not.toBeInTheDocument();
  });
});
