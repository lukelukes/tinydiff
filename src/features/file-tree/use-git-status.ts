import { useState, useEffect } from 'react';

import { commands, type GitStatus, type CommandError } from '../../../tauri-bindings';

type GitStatusState =
  | { status: 'loading' }
  | { status: 'success'; data: GitStatus }
  | { status: 'error'; error: CommandError };

export function useGitStatus(repoPath: string) {
  const [state, setState] = useState<GitStatusState>({ status: 'loading' });

  const refresh = async () => {
    setState({ status: 'loading' });
    const result = await commands.getGitStatus(repoPath);
    if (result.status === 'ok') {
      setState({ status: 'success', data: result.data });
    } else {
      setState({ status: 'error', error: result.error });
    }
  };

  useEffect(() => {
    void refresh();
  }, [repoPath]);

  return { state, refresh };
}
