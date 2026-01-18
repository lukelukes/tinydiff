import type { ReactNode } from 'react';

import { settingsStore } from '#lib/settings-store';
import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react';

export type DiffStyle = 'split' | 'unified';

interface DiffViewContextValue {
  diffStyle: DiffStyle;
  setDiffStyle: (style: DiffStyle) => void;
}

export const DiffViewContext = createContext<DiffViewContextValue | null>(null);

export function DiffViewProvider({ children }: { children: ReactNode }) {
  const [diffStyle, setDiffStyle] = useState<DiffStyle>('split');

  useEffect(() => {
    void settingsStore.get<DiffStyle>('viewMode').then((value) => {
      if (value) {
        setDiffStyle(value);
      }
      return;
    });
  }, []);

  const setAndPersist = useCallback((style: DiffStyle) => {
    setDiffStyle(style);
    void settingsStore.set('viewMode', style);
  }, []);

  const value = useMemo(
    () => ({ diffStyle, setDiffStyle: setAndPersist }),
    [diffStyle, setAndPersist]
  );
  return <DiffViewContext value={value}>{children}</DiffViewContext>;
}

export function useDiffView() {
  const context = use(DiffViewContext);
  if (!context) {
    throw new Error('useDiffView must be used within DiffViewProvider');
  }
  return context;
}
