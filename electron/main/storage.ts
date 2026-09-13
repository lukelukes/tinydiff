import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { app } from 'electron';

export function userDataFile(name: string): string {
  return join(app.getPath('userData'), name);
}

export function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function discard(temp: string): void {
  try {
    rmSync(temp, { force: true });
  } catch {
    return;
  }
}

export function writeJson(file: string, value: unknown): void {
  const temp = `${file}.tmp`;
  mkdirSync(dirname(file), { recursive: true });
  try {
    writeFileSync(temp, JSON.stringify(value, null, 2));
    renameSync(temp, file);
  } catch (error) {
    discard(temp);
    throw error;
  }
}
