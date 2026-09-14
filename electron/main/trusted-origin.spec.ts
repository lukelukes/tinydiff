import { describe, expect, it } from 'vitest';

import { RENDERER_ORIGIN } from './csp';
import { trustedOriginFor } from './trusted-origin';

describe('trustedOriginFor', () => {
  it('trusts only the app scheme when the app is packaged', () => {
    expect(trustedOriginFor('http://127.0.0.1:5173', true)).toBe(RENDERER_ORIGIN);
    expect(trustedOriginFor(null, true)).toBe(RENDERER_ORIGIN);
  });

  it('trusts the dev server origin only when unpackaged and configured', () => {
    expect(trustedOriginFor('http://127.0.0.1:5173', false)).toBe('http://127.0.0.1:5173');
    expect(trustedOriginFor(null, false)).toBe(RENDERER_ORIGIN);
  });
});
