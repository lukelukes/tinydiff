import { DEV_CSP_NONCE_ENV } from './csp';

interface DevRenderer {
  url: string;
  nonce: string;
}

export function httpUrl(candidate: string): URL | null {
  const url = URL.parse(candidate);
  if (url === null || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    return null;
  }
  return url;
}

export function devRenderer(
  env: Record<string, string | undefined>,
  packaged: boolean
): DevRenderer | null {
  const override = env.ELECTRON_RENDERER_URL;
  if (packaged || !override) {
    return null;
  }
  const url = httpUrl(override);
  if (url === null) {
    throw new Error(`ELECTRON_RENDERER_URL must be an http(s) URL, got ${override}`);
  }
  const nonce = env[DEV_CSP_NONCE_ENV];
  if (!nonce) {
    throw new Error(`${DEV_CSP_NONCE_ENV} must be set alongside ELECTRON_RENDERER_URL`);
  }
  return { url: url.href, nonce };
}

export function withinRenderer(rendererUrl: string, target: string): boolean {
  return target.startsWith(new URL('/', rendererUrl).href);
}
