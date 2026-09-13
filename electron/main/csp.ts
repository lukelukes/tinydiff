export const RENDERER_ORIGIN = 'app://renderer';

export const DEV_CSP_NONCE = 'tinydiff-dev';

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

export const DEV_CSP = serialize({
  ...directives,
  'script-src': [...directives['script-src'], `'nonce-${DEV_CSP_NONCE}'`]
});
