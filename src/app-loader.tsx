import { Component, useEffect, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

import type { AppMode } from '#core/app-mode';
import { getAppMode } from '#core/app-mode';

import App from './app.tsx';
import { ErrorDisplay } from './components/error-display.tsx';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('React ErrorBoundary caught:', error);
    console.error('Component stack:', errorInfo.componentStack);
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

function LoadingScreen() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-zinc-900">
      <div className="text-zinc-400">Loading...</div>
    </div>
  );
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'ready'; mode: AppMode };

function AppLoader() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let mounted = true;
    getAppMode()
      .then((mode) => {
        if (mounted) setState({ status: 'ready', mode });
      })
      .catch((e: unknown) => {
        if (mounted) {
          const error = e instanceof Error ? e : new Error(String(e));
          console.error('Failed to load app mode:', error);
          setState({ status: 'error', error });
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const retry = () => {
    setState({ status: 'loading' });
    getAppMode()
      .then((mode) => setState({ status: 'ready', mode }))
      .catch((e: unknown) => {
        const error = e instanceof Error ? e : new Error(String(e));
        console.error('Failed to load app mode:', error);
        setState({ status: 'error', error });
      });
  };

  switch (state.status) {
    case 'loading':
      return <LoadingScreen />;
    case 'error':
      return <ErrorDisplay title="Failed to initialize" error={state.error} onRetry={retry} />;
    case 'ready':
      return (
        <ErrorBoundary>
          <App mode={state.mode} />
        </ErrorBoundary>
      );
  }
}

export default AppLoader;
