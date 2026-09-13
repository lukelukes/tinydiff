import { createRequire } from 'node:module';

import type * as Addon from '../../crates/tinydiff-napi/index';
import addonPath from '../../crates/tinydiff-napi/tinydiff.node?asset&asarUnpack';

export const native = createRequire(import.meta.url)(addonPath) as typeof Addon;
