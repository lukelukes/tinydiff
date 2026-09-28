import { createRequire } from 'node:module';

import type { NativeAddon } from '../../src/bindings/api';

function isAddon(value: unknown): value is NativeAddon {
  return typeof value === 'object' && value !== null && 'resolveAppMode' in value;
}

export function loadAddon(path: string): NativeAddon {
  const load: (id: string) => unknown = createRequire(import.meta.url);
  const addon = load(path);
  if (!isAddon(addon)) {
    throw new Error(`${path} does not export the tinydiff addon`);
  }
  return addon;
}
