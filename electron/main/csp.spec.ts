import { describe, expect, it } from 'vitest';

import { CSP, devCsp } from './csp';

const nonce = 'bm9uY2U=';

function parse(policy: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const directive of policy.split(';')) {
    const [name, ...sources] = directive.trim().split(/\s+/u);
    if (name) {
      expect([...directives.keys()]).not.toContain(name);
      directives.set(name, sources);
    }
  }
  return directives;
}

const production = parse(CSP);
const development = parse(devCsp(nonce));

describe('content security policy', () => {
  it('production script-src allows only self', () => {
    expect(production.get('script-src')).toStrictEqual(["'self'"]);
  });

  it('dev script-src adds only the nonce', () => {
    expect(development.get('script-src')).toStrictEqual(["'self'", `'nonce-${nonce}'`]);
  });

  it.for([
    { name: 'production', directives: production },
    { name: 'development', directives: development }
  ])('$name allows unsafe-inline only on style-src', ({ directives }) => {
    const withUnsafeInline = [...directives]
      .filter(([, sources]) => sources.includes("'unsafe-inline'"))
      .map(([name]) => name);
    expect(withUnsafeInline).toStrictEqual(['style-src']);
  });

  it.for([
    { name: 'production', directives: production },
    { name: 'development', directives: development }
  ])('$name never allows unsafe-eval or wildcard sources', ({ directives }) => {
    const sources = [...directives.values()].flat();
    expect(sources).not.toContain("'unsafe-eval'");
    expect(sources).not.toContain('*');
  });

  it('production locks every directive to the expected sources', () => {
    expect(Object.fromEntries(production)).toStrictEqual({
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:'],
      'worker-src': ["'self'"],
      'font-src': ["'self'"],
      'connect-src': ["'self'"]
    });
  });

  it('dev differs from production only in script-src', () => {
    const { 'script-src': _prodScript, ...prodRest } = Object.fromEntries(production);
    const { 'script-src': _devScript, ...devRest } = Object.fromEntries(development);
    expect(devRest).toStrictEqual(prodRest);
  });
});
