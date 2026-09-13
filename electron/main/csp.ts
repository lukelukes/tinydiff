export const RENDERER_ORIGIN = 'app://renderer';

export const DEV_CSP_NONCE_ENV = 'TINYDIFF_DEV_CSP_NONCE';

const directives = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:'],
  'worker-src': ["'self'"],
  'font-src': ["'self'"],
  'connect-src': ["'self'"]
};

function serialize(policy: Record<string, string[]>): string {
  return Object.entries(policy)
    .map(([name, sources]) => `${name} ${sources.join(' ')}`)
    .join('; ');
}

export const CSP = serialize(directives);

export function devCsp(nonce: string | undefined): string {
  if (!nonce) {
    return CSP;
  }
  return serialize({
    ...directives,
    'script-src': [...directives['script-src'], `'nonce-${nonce}'`]
  });
}
