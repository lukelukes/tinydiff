import type { ReactNode } from 'react';

import { createContext, use, useMemo, useState } from 'react';

export type DiffStyle = 'split' | 'unified';

interface DiffViewContextValue {
  diffStyle: DiffStyle;
  setDiffStyle: (style: DiffStyle) => void;
}

export const DiffViewContext = createContext<DiffViewContextValue | null>(null);

export function DiffViewProvider({ children }: { children: ReactNode }) {
  const [diffStyle, setDiffStyle] = useState<DiffStyle>('split');
  // TODO(settings-1): persist via Rust settings backend
  const value = useMemo(() => ({ diffStyle, setDiffStyle }), [diffStyle]);
  return <DiffViewContext value={value}>{children}</DiffViewContext>;
}

export function useDiffView() {
  const context = use(DiffViewContext);
  if (!context) {
    throw new Error('useDiffView must be used within DiffViewProvider');
  }
  return context;
}
