import { app } from 'electron';

import { devRendererUrl } from './renderer-url';
import { trustedOriginFor } from './trusted-origin';

export const rendererUrl = devRendererUrl(process.env.ELECTRON_RENDERER_URL, app.isPackaged);

export const devOrigin = rendererUrl ? new URL(rendererUrl).origin : null;

export const trustedOrigin = trustedOriginFor(devOrigin, app.isPackaged);
