import { execFileSync } from 'node:child_process';
import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

import { FuseV1Options, getCurrentFuseWire } from '@electron/fuses';

import builder from '../electron-builder.json';
import { version } from '../package.json';

export const GLIBC_BASELINE = '2.38';
export const INSTALL_DIR = `opt/${builder.productName}`;
export const EXECUTABLE = builder.executableName;

const ARCH_NAMES = {
  x64: { appImage: 'x86_64', deb: 'amd64', unpacked: 'linux-unpacked' },
  arm64: { appImage: 'arm64', deb: 'arm64', unpacked: 'linux-arm64-unpacked' }
} as const;

const GLIBC_SYMBOL = /GLIBC_(?<version>\d+(?:\.\d+)+)/gu;

interface Artifacts {
  appImage: string;
  deb: string;
  unpacked: string;
}

interface ExtractedDeb {
  root: string;
  control: string;
}

export function artifacts(): Artifacts {
  const { arch } = process;
  if (arch !== 'x64' && arch !== 'arm64') {
    throw new Error(`there is no linux package for ${arch}`);
  }
  const names = ARCH_NAMES[arch];
  const output = resolve(builder.directories.output);
  const base = `${builder.productName}-${version}`;
  return {
    appImage: join(output, `${base}-${names.appImage}.AppImage`),
    deb: join(output, `${base}-${names.deb}.deb`),
    unpacked: join(output, names.unpacked)
  };
}

export function run(file: string, args: string[], cwd?: string): string {
  return execFileSync(file, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

export function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `tinydiff-${prefix}-`));
}

export function extractAppImage(file: string, dir: string): string {
  run(file, ['--appimage-extract'], dir);
  return join(dir, 'squashfs-root');
}

function extractDebMember(file: string, prefix: string, dir: string): void {
  const member = run('ar', ['t', file])
    .split('\n')
    .find((entry) => entry.startsWith(prefix));
  if (member === undefined) {
    throw new Error(`${file} has no ${prefix} member`);
  }
  mkdirSync(dir);
  run('ar', ['x', file, member], dir);
  run('tar', ['-xf', member], dir);
}

export function extractDeb(file: string, dir: string): ExtractedDeb {
  const root = join(dir, 'data');
  const control = join(dir, 'control');
  extractDebMember(file, 'data.tar', root);
  extractDebMember(file, 'control.tar', control);
  return { root, control: readFileSync(join(control, 'control'), 'utf8') };
}

function isElf(file: string): boolean {
  const magic = Buffer.alloc(4);
  const handle = openSync(file, 'r');
  try {
    return readSync(handle, magic, 0, 4, 0) === 4 && magic.toString('latin1') === '\u007FELF';
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

export function glibcAbove(root: string, ceiling: string): string[] {
  const required = binaries(root).flatMap((file) =>
    [...run('objdump', ['-p', file]).matchAll(GLIBC_SYMBOL)].map((match) => ({
      file: relative(root, file),
      glibc: match.groups?.version ?? ''
    }))
  );
  if (required.length === 0) {
    throw new Error(`${root} contains no binary linked against glibc`);
  }
  const offending = required
    .filter(({ glibc }) => compareVersions(glibc, ceiling) > 0)
    .map(({ file, glibc }) => `${file} needs GLIBC_${glibc}`);
  return [...new Set(offending)];
}

export function declaredLibcMinimum(control: string): string {
  const depends = /^Depends:(?<list>.*)$/mu.exec(control)?.groups?.list ?? '';
  const minimum = /libc6 \(>= (?<version>[\d.]+)\)/u.exec(depends)?.groups?.version;
  if (minimum === undefined) {
    throw new Error(`the package declares no libc6 minimum: ${depends.trim()}`);
  }
  return minimum;
}

export type FuseName = keyof typeof FuseV1Options;

const FUSE_NAMES = Object.keys(FuseV1Options).filter((key): key is FuseName =>
  Number.isNaN(Number(key))
);

function fuseState(code: number | undefined): boolean | string {
  const state = code === undefined ? undefined : String.fromCodePoint(code);
  if (state === '1') {
    return true;
  }
  if (state === '0') {
    return false;
  }
  return `neither enabled nor disabled (${String(code)})`;
}

export async function shippedFuses(binary: string): Promise<Record<string, boolean | string>> {
  const wire = await getCurrentFuseWire(binary);
  return Object.fromEntries(FUSE_NAMES.map((name) => [name, fuseState(wire[FuseV1Options[name]])]));
}
