import { useCallback, useEffect, useState } from 'react';

import {
  commands,
  type CommandError,
  type DiffTarget,
  type GitFileContents
} from '../../../tauri-bindings';

type GitFileContentsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: GitFileContents }
  | { status: 'error'; error: CommandError };

export function useGitFileContents(
  repoPath: string,
  filePath: string | null,
  target: DiffTarget | null
) {
  const [state, setState] = useState<GitFileContentsState>({ status: 'idle' });

  const load = useCallback(
    async (canApply: () => boolean = () => true) => {
      if (filePath === null || target === null) {
        if (canApply()) setState({ status: 'idle' });
        return;
      }
      if (canApply()) setState({ status: 'loading' });
      const result = await commands.getGitFileContents(repoPath, filePath, target);
      if (!canApply()) return;
      setState(
        result.status === 'ok'
          ? { status: 'success', data: result.data }
          : { status: 'error', error: result.error }
      );
    },
    [repoPath, filePath, target]
  );

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  useEffect(() => {
    let active = true;
    const timeoutId = setTimeout(() => {
      void load(() => active);
    }, 0);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [load]);

  return { state, refresh };
}
