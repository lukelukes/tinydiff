import type { CommandError } from '#bindings/index';

export function getErrorMessage(error: CommandError): string {
  return error.type === 'utf8' ? `UTF-8 encoding error for ${error.path}` : error.message;
}
