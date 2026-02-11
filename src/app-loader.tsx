import type { AppMode } from '#core/app-mode';
import type { ErrorInfo, ReactNode } from 'react';

import { getAppMode } from '#core/app-mode';
import { Component, useCallback, useEffect, useRef, useState } from 'react';

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

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'ready'; mode: AppMode };

function AppLoader() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const mountedRef = useRef(true);

  const load = useCallback(() => {
    getAppMode()
      .then((mode) => {
        if (mountedRef.current) setState({ status: 'ready', mode });
        return;
      })
      .catch((e: unknown) => {
        if (mountedRef.current) {
          const error = e instanceof Error ? e : new Error(String(e));
          console.error('Failed to load app mode:', error);
          setState({ status: 'error', error });
        }
      });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  const retry = () => {
    setState({ status: 'loading' });
    load();
  };

  switch (state.status) {
    case 'loading':
      return (
        <div className="flex h-full w-full flex-col items-center justify-center bg-background">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      );
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
