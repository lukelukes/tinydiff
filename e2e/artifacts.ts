import { execFileSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, readdirSync, readSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const GLIBC_BASELINE = '2.38';
export const INSTALL_PREFIX = 'opt/TinyDiff';
export const SANDBOX_HELPER = `${INSTALL_PREFIX}/chrome-sandbox`;

export const appImage = process.env.TD_ARTIFACT_APPIMAGE ?? '';
export const deb = process.env.TD_ARTIFACT_DEB ?? '';

const GLIBC_SYMBOL = /GLIBC_(?<version>\d+(?:\.\d+)+)/gu;

export function run(file: string, args: string[], cwd?: string): string {
  return execFileSync(file, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

export function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `tinydiff-artifact-${prefix}-`));
}

export function extractAppImage(file: string, dir: string): string {
  run(resolve(file), ['--appimage-extract'], dir);
  return join(dir, 'squashfs-root');
}

export function extractDebMember(file: string, prefix: string, dir: string): string {
  const archive = resolve(file);
  const member = run('ar', ['t', archive])
    .split('\n')
    .find((entry) => entry.startsWith(prefix));
  if (member === undefined) {
    throw new Error(`${file} has no ${prefix} member`);
  }
  run('ar', ['x', archive, member], dir);
  run('tar', ['-xf', member], dir);
  return dir;
}

function isElf(file: string): boolean {
  const magic = Buffer.alloc(4);
  const handle = openSync(file, 'r');
  try {
    return readSync(handle, magic, 0, 4, 0) === 4 && magic.toString('latin1') === 'ELF';
  } finally {
    closeSync(handle);
  }
}

function compareVersions(left: string, right: string): number {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

function binaries(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((file) => isElf(file));
}

export function highestGlibc(root: string): string {
  const versions = binaries(root).flatMap((file) =>
    [...run('objdump', ['-p', file]).matchAll(GLIBC_SYMBOL)].map(
      (match) => match.groups?.version ?? ''
    )
  );
  if (versions.length === 0) {
    throw new Error(`${root} contains no binary linked against glibc`);
  }
  return versions.reduce((highest, version) =>
    compareVersions(version, highest) > 0 ? version : highest
  );
}

export function declaredLibcMinimum(control: string): string {
  const depends = /^Depends:(?<list>.*)$/mu.exec(control)?.groups?.list ?? '';
  const minimum = /libc6 \(>= (?<version>[\d.]+)\)/u.exec(depends)?.groups?.version;
  if (minimum === undefined) {
    throw new Error(`the package declares no libc6 minimum: ${depends.trim()}`);
  }
  return minimum;
}
