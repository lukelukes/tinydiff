import { RENDERER_ORIGIN } from './csp';

export function trustedOriginFor(devOrigin: string | null, packaged: boolean): string {
  if (packaged || devOrigin === null) {
    return RENDERER_ORIGIN;
  }
  return devOrigin;
}
