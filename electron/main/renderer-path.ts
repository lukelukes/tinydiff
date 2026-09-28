import { isAbsolute, relative, resolve } from 'node:path';

export const SCHEME = 'app';
export const HOST = 'renderer';

export function rendererFilePath(requestUrl: string, root: string): string | null {
  const { host, pathname } = new URL(requestUrl);
  const target = resolve(root, pathname === '/' ? 'index.html' : `.${pathname}`);
  const rel = relative(root, target);
  if (host !== HOST || rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    return null;
  }
  return target;
}
