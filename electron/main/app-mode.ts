import { resolve } from 'node:path';

import type { AppMode, CommandError, Result } from '../../src/bindings/types';
import { native } from './native';

export function cliPaths(argv: readonly string[]): string[] {
  const base = process.env.OWD ?? process.cwd();
  const positional = argv.slice(1).filter((arg) => !arg.startsWith('-'));
  if (process.defaultApp) {
    positional.shift();
  }
  return positional.map((arg) => resolve(base, arg));
}

export function resolveAppMode(argv: readonly string[]): Result<AppMode, CommandError> {
  return native.resolveAppMode(cliPaths(argv));
}

export function describeError(error: CommandError): string {
  switch (error.type) {
    case 'path':
      return error.message;
    case 'utf8':
      return `Path contains invalid UTF-8: ${error.path}`;
    case 'git':
      return error.path ? `${error.message} (${error.path})` : error.message;
  }
}
