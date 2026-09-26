import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

export function cliPaths(argv: readonly string[], defaultApp: boolean, cwd: string): string[] {
  const { positionals } = parseArgs({
    args: argv.slice(1),
    strict: false,
    allowPositionals: true
  });
  return positionals.slice(defaultApp ? 1 : 0).map((arg) => resolve(cwd, arg));
}
