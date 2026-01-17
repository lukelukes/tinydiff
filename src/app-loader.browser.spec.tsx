import { Component, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { ErrorDisplay } from './components/error-display';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class TestErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <ErrorDisplay
          title="Something went wrong"
          error={this.state.error ?? new Error('Unknown error')}
        />
      );
    }
    return this.props.children;
  }
}

function ThrowingComponent(): ReactNode {
  throw new Error('Test error from component');
}

describe('ErrorBoundary', () => {
  it('catches render errors and shows error display', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const screen = await render(
      <TestErrorBoundary>
        <ThrowingComponent />
      </TestErrorBoundary>
    );

    const errorTitle = screen.getByText('Something went wrong');
    await expect.element(errorTitle).toBeVisible();

    const errorMessage = screen.getByText('Test error from component');
    await expect.element(errorMessage).toBeVisible();

    consoleSpy.mockRestore();
  });

  it('renders children when no error occurs', async () => {
    const screen = await render(
      <TestErrorBoundary>
        <div>Normal content</div>
      </TestErrorBoundary>
    );

    const content = screen.getByText('Normal content');
    await expect.element(content).toBeVisible();
  });
});
