import { describe, expect, it } from 'vitest';

import { devRenderer, httpUrl, withinRenderer } from './urls';

const nonce = 'bm9uY2U=';

describe('httpUrl', () => {
  it('normalises http and https urls', () => {
    expect(httpUrl('http://open-external.invalid')?.href).toBe('http://open-external.invalid/');
    expect(httpUrl('https://open-external.invalid/docs')?.href).toBe(
      'https://open-external.invalid/docs'
    );
  });

  it('rejects urls outside the http(s) allowlist', () => {
    expect(httpUrl('file:///etc/passwd')).toBeNull();
    expect(httpUrl('app://renderer/index.html')).toBeNull();
    expect(httpUrl('data:text/html,<p>hi</p>')).toBeNull();
    expect(httpUrl('not a url')).toBeNull();
  });
});

describe('devRenderer', () => {
  it('ignores the override when the app is packaged', () => {
    expect(
      devRenderer(
        { ELECTRON_RENDERER_URL: 'http://127.0.0.1:5173/', TINYDIFF_DEV_CSP_NONCE: nonce },
        true
      )
    ).toBeNull();
  });

  it('returns null when the override is unset or empty', () => {
    expect(devRenderer({ TINYDIFF_DEV_CSP_NONCE: nonce }, false)).toBeNull();
    expect(
      devRenderer({ ELECTRON_RENDERER_URL: '', TINYDIFF_DEV_CSP_NONCE: nonce }, false)
    ).toBeNull();
  });

  it('pairs an http(s) override with the dev csp nonce', () => {
    expect(
      devRenderer(
        { ELECTRON_RENDERER_URL: 'http://127.0.0.1:5173/', TINYDIFF_DEV_CSP_NONCE: nonce },
        false
      )
    ).toStrictEqual({ url: 'http://127.0.0.1:5173/', nonce });
    expect(
      devRenderer(
        { ELECTRON_RENDERER_URL: 'https://localhost:5173', TINYDIFF_DEV_CSP_NONCE: nonce },
        false
      )
    ).toStrictEqual({ url: 'https://localhost:5173/', nonce });
  });

  it('rejects overrides that are not http(s) URLs', () => {
    for (const override of ['file:///tmp/index.html', 'app://renderer/', 'not a url']) {
      expect(() =>
        devRenderer({ ELECTRON_RENDERER_URL: override, TINYDIFF_DEV_CSP_NONCE: nonce }, false)
      ).toThrow('http(s)');
    }
  });

  it('rejects an override without a dev csp nonce', () => {
    expect(() => devRenderer({ ELECTRON_RENDERER_URL: 'http://127.0.0.1:5173/' }, false)).toThrow(
      'TINYDIFF_DEV_CSP_NONCE'
    );
    expect(() =>
      devRenderer(
        { ELECTRON_RENDERER_URL: 'http://127.0.0.1:5173/', TINYDIFF_DEV_CSP_NONCE: '' },
        false
      )
    ).toThrow('TINYDIFF_DEV_CSP_NONCE');
  });
});

describe('withinRenderer', () => {
  it('allows navigation inside the packaged app:// renderer', () => {
    expect(withinRenderer('app://renderer/', 'app://renderer/')).toBe(true);
    expect(withinRenderer('app://renderer/', 'app://renderer/index.html#/review')).toBe(true);
  });

  it('allows navigation inside the dev server origin', () => {
    expect(withinRenderer('http://127.0.0.1:5173/', 'http://127.0.0.1:5173/nested/page')).toBe(
      true
    );
  });

  it('rejects navigation to any other origin', () => {
    expect(withinRenderer('app://renderer/', 'app://other/index.html')).toBe(false);
    expect(withinRenderer('app://renderer/', 'http://127.0.0.1:5173/')).toBe(false);
    expect(withinRenderer('http://127.0.0.1:5173/', 'http://127.0.0.1:51730/')).toBe(false);
    expect(withinRenderer('http://127.0.0.1:5173/', 'http://127.0.0.1:5173@evil.invalid/')).toBe(
      false
    );
    expect(withinRenderer('http://127.0.0.1:5173/', 'https://evil.invalid/')).toBe(false);
  });
});
