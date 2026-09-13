import { shell } from 'electron';

import { externalUrl } from './external-url';

export async function openExternal(url: unknown): Promise<boolean> {
  const target = typeof url === 'string' ? externalUrl(url) : null;
  if (target === null) {
    return false;
  }
  await shell.openExternal(target);
  return true;
}
