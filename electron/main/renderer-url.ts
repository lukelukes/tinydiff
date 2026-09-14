export function devRendererUrl(override: string | undefined, packaged: boolean): string | null {
  if (packaged || !override) {
    return null;
  }
  const url = URL.parse(override);
  if (url === null || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    throw new Error(`ELECTRON_RENDERER_URL must be an http(s) URL, got ${override}`);
  }
  return url.href;
}
