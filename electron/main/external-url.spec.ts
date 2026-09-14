import { describe, expect, it } from 'vitest';

import { RENDERER_ORIGIN } from './csp';
import { externalUrl } from './external-url';

describe('externalUrl', () => {
  it('normalises http and https urls', () => {
    expect(externalUrl('http://open-external.invalid')).toBe('http://open-external.invalid/');
    expect(externalUrl('https://open-external.invalid/docs')).toBe(
      'https://open-external.invalid/docs'
    );
  });

  it('rejects urls outside the http(s) allowlist', () => {
    expect(externalUrl('file:///etc/passwd')).toBeNull();
    expect(externalUrl(`${RENDERER_ORIGIN}/index.html`)).toBeNull();
    expect(externalUrl('data:text/html,<p>hi</p>')).toBeNull();
    expect(externalUrl('not a url')).toBeNull();
  });
});
