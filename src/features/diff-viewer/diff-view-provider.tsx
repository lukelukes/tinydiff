import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { DiffViewContext, type DiffStyle } from './diff-view-context';

export function DiffViewProvider({ children }: { children: ReactNode }) {
  const [diffStyle, setDiffStyle] = useState<DiffStyle>('split');

  useEffect(() => {
    void window.tinydiff.settingsGet('viewMode').then((value) => {
      setDiffStyle(value);
      return;
    });
  }, []);

  const setAndPersist = useCallback((style: DiffStyle) => {
    setDiffStyle(style);
    void window.tinydiff.settingsSet('viewMode', style);
  }, []);

  const value = useMemo(
    () => ({ diffStyle, setDiffStyle: setAndPersist }),
    [diffStyle, setAndPersist]
  );
  return <DiffViewContext value={value}>{children}</DiffViewContext>;
}
