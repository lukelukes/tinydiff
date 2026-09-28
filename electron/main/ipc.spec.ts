import { describe, expect, it, vi } from 'vitest';

import type { InvokeRegistrar } from './ipc';
import { registerIpc } from './ipc';

const RENDERER_URL = 'app://renderer/';

type Listener = Parameters<InvokeRegistrar['handle']>[1];

function register(handler: (...args: never[]) => unknown): Listener {
  const listeners = new Map<string, Listener>();
  registerIpc(
    {
      handle: (channel, listener) => {
        listeners.set(channel, listener);
      }
    },
    { getGitStatus: handler },
    RENDERER_URL
  );
  const listener = listeners.get('tinydiff:getGitStatus');
  if (listener === undefined) {
    throw new Error('tinydiff:getGitStatus was not registered');
  }
  return listener;
}

describe('registerIpc', () => {
  it.for([
    { name: 'a foreign origin', senderFrame: { url: 'https://evil.invalid/' } },
    { name: 'a lookalike host', senderFrame: { url: 'app://renderer.evil/index.html' } },
    { name: 'a file url', senderFrame: { url: 'file:///home/user/index.html' } },
    { name: 'a destroyed frame', senderFrame: null }
  ])('rejects calls from $name without reaching the handler', ({ senderFrame }) => {
    const handler = vi.fn<(path: string) => string>(() => 'status');
    const listener = register(handler);

    expect(() => listener({ senderFrame }, '/repo')).toThrow(
      'tinydiff:getGitStatus rejected: untrusted sender'
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it('forwards calls from the renderer to the handler', () => {
    const handler = vi.fn<(path: string) => string>((path) => `status of ${path}`);
    const listener = register(handler);

    expect(listener({ senderFrame: { url: 'app://renderer/index.html' } }, '/repo')).toBe(
      'status of /repo'
    );
    expect(handler).toHaveBeenCalledWith('/repo');
  });
});
