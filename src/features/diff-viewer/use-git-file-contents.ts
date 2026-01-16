import { useEffect, useState } from 'react';

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

  const refresh = async () => {
    if (filePath === null || target === null) {
      setState({ status: 'idle' });
      return;
    }
    setState({ status: 'loading' });
    const result = await commands.getGitFileContents(repoPath, filePath, target);
    if (result.status === 'ok') {
      setState({ status: 'success', data: result.data });
    } else {
      setState({ status: 'error', error: result.error });
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (filePath === null || target === null) {
        setState({ status: 'idle' });
        return;
      }
      setState({ status: 'loading' });
      const result = await commands.getGitFileContents(repoPath, filePath, target);
      if (cancelled) return;
      if (result.status === 'ok') {
        setState({ status: 'success', data: result.data });
      } else {
        setState({ status: 'error', error: result.error });
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [repoPath, filePath, target]);

  return { state, refresh };
}
