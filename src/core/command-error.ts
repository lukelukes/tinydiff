import type { CommandError } from '#tauri-bindings/index';

export function getErrorMessage(error: CommandError): string {
  switch (error.type) {
    case 'path':
      return error.message;
    case 'utf8':
      return `UTF-8 encoding error for ${error.path}`;
    case 'git':
      return error.message;
  }
}
