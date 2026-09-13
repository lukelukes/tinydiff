import { isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { net, protocol, session } from 'electron';

import { CSP, DEV_CSP } from './csp';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

function notFound(): Response {
  return new Response(null, { status: 404 });
}

export function serveRenderer(root: string): void {
  protocol.handle('app', async (request) => {
    const { host, pathname } = new URL(request.url);
    const target = resolve(root, pathname === '/' ? 'index.html' : `.${pathname}`);
    const rel = relative(root, target);
    if (host !== 'renderer' || rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
      return notFound();
    }
    try {
      const response = await net.fetch(pathToFileURL(target).href);
      const headers = new Headers(response.headers);
      headers.set('content-security-policy', CSP);
      return new Response(response.body, { status: response.status, headers });
    } catch {
      return notFound();
    }
  });
}

export function applyDevCsp(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: { ...details.responseHeaders, 'content-security-policy': [DEV_CSP] }
    });
  });
}
