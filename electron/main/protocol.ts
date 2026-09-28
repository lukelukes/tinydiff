import { pathToFileURL } from 'node:url';

import { net, protocol, session } from 'electron';

import { CSP, devCsp } from './csp';
import { HOST, rendererFilePath, SCHEME } from './renderer-path';

export const RENDERER_URL = `${SCHEME}://${HOST}/`;

function notFound(): Response {
  return new Response(null, { status: 404 });
}

export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }
  ]);
}

export function serveRenderer(root: string): void {
  protocol.handle(SCHEME, async (request) => {
    const target = rendererFilePath(request.url, root);
    if (target === null) {
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

export function applyDevCsp(nonce: string): void {
  const policy = devCsp(nonce);
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: { ...details.responseHeaders, 'content-security-policy': [policy] }
    });
  });
}
