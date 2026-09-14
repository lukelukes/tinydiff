import { describe, expect, it } from 'vitest';

import { RENDERER_ORIGIN } from './csp';
import { devRendererUrl } from './renderer-url';

describe('devRendererUrl', () => {
  it('ignores the override when the app is packaged', () => {
    expect(devRendererUrl('http://127.0.0.1:5173/', true)).toBeNull();
  });

  it('returns null when the override is unset or empty', () => {
    expect(devRendererUrl(undefined, false)).toBeNull();
    expect(devRendererUrl('', false)).toBeNull();
  });

  it('accepts http and https overrides', () => {
    expect(devRendererUrl('http://127.0.0.1:5173/', false)).toBe('http://127.0.0.1:5173/');
    expect(devRendererUrl('https://localhost:5173', false)).toBe('https://localhost:5173/');
  });

  it('rejects overrides that are not http(s) URLs', () => {
    expect(() => devRendererUrl('file:///tmp/index.html', false)).toThrow('http(s)');
    expect(() => devRendererUrl(`${RENDERER_ORIGIN}/`, false)).toThrow('http(s)');
    expect(() => devRendererUrl('not a url', false)).toThrow(TypeError);
  });
});
