import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const FILE_NAME = 'greeter.ts';

const ORIGINAL = `export function greet(name: string): string {
  return \`hello \${name}\`;
}
`;

const MODIFIED = `export function greet(name: string, excited = false): string {
  const punctuation = excited ? '!' : '.';
  return \`hello \${name}\${punctuation}\`;
}
`;

function git(cwd: string, args: string[]): void {
  execFileSync('git', ['-c', 'user.name=e2e', '-c', 'user.email=e2e@example.com', ...args], {
    cwd,
    stdio: 'ignore'
  });
}

export function createRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tinydiff-e2e-repo-'));
  try {
    git(dir, ['init', '-q']);
    writeFileSync(join(dir, FILE_NAME), ORIGINAL);
    git(dir, ['add', FILE_NAME]);
    git(dir, ['commit', '-q', '-m', 'initial']);
    writeFileSync(join(dir, FILE_NAME), MODIFIED);
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
  return dir;
}
