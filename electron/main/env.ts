import { app } from 'electron';

import { RENDERER_ORIGIN } from './csp';
import { devRendererUrl } from './renderer-url';

export const rendererUrl = devRendererUrl(process.env.ELECTRON_RENDERER_URL, app.isPackaged);

export const devOrigin = rendererUrl ? new URL(rendererUrl).origin : null;

export const trustedOrigin = devOrigin ?? RENDERER_ORIGIN;
