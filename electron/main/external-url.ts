export function externalUrl(candidate: string): string | null {
  const url = URL.parse(candidate);
  if (url === null || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    return null;
  }
  return url.href;
}
