import { createRequire } from 'node:module';

import type * as Addon from '../../crates/tinydiff-napi/index';
import addonPath from '../../crates/tinydiff-napi/tinydiff.node?asset&asarUnpack';

function isAddon(value: unknown): value is typeof Addon {
  return typeof value === 'object' && value !== null && 'resolveAppMode' in value;
}

function loadAddon(): typeof Addon {
  const load: (id: string) => unknown = createRequire(import.meta.url);
  const addon = load(addonPath);
  if (!isAddon(addon)) {
    throw new Error(`${addonPath} does not export the tinydiff addon`);
  }
  return addon;
}

export const native = loadAddon();
