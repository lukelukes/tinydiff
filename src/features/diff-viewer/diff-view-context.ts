import { createContext, use } from 'react';

import type { Settings } from '#bindings/index';

export type DiffStyle = Settings['viewMode'];

export interface DiffViewContextValue {
  diffStyle: DiffStyle;
  setDiffStyle: (style: DiffStyle) => void;
}

export const DiffViewContext = createContext<DiffViewContextValue | null>(null);

export function useDiffView() {
  const context = use(DiffViewContext);
  if (!context) {
    throw new Error('useDiffView must be used within DiffViewProvider');
  }
  return context;
}
