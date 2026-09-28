import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

export type CliCommand =
  | { kind: 'help' }
  | { kind: 'version' }
  | { kind: 'paths'; paths: string[] };

export const USAGE = `A tiny diff viewer

Usage: tinydiff [OPTIONS] [PATH]...

Arguments:
  [PATH]...  Up to two paths

Options:
  -h, --help     Print help
  -V, --version  Print version

Examples:
  tinydiff              Show welcome screen
  tinydiff <path>       View git changes in repository
  tinydiff <a> <b>      Compare two files
`;

const flags: Partial<Record<string, 'help' | 'version'>> = {
  help: 'help',
  h: 'help',
  version: 'version',
  V: 'version'
};

export function parseCli(argv: readonly string[], defaultApp: boolean, cwd: string): CliCommand {
  const { tokens } = parseArgs({
    args: argv.slice(1),
    strict: false,
    allowPositionals: true,
    tokens: true
  });
  const entry = defaultApp ? tokens.findIndex((token) => token.kind === 'positional') : -1;
  const paths: string[] = [];
  for (const token of tokens.slice(entry + 1)) {
    if (token.kind === 'positional') {
      paths.push(resolve(cwd, token.value));
    } else if (token.kind === 'option') {
      const kind = flags[token.name];
      if (kind !== undefined) {
        return { kind };
      }
    }
  }
  return { kind: 'paths', paths };
}
