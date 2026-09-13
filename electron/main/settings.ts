import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { app } from 'electron';

type Settings = Record<string, unknown>;

const defaults: Settings = { theme: 'dark', viewMode: 'split' };

const WRITE_DELAY_MS = 100;

let values: Settings | null = null;
let pendingWrite: NodeJS.Timeout | null = null;

function settingsFile(): string {
  return join(app.getPath('userData'), 'settings.json');
}

function isRecord(value: unknown): value is Settings {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function load(): Settings {
  if (values) {
    return values;
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(settingsFile(), 'utf8'));
    values = { ...defaults, ...(isRecord(parsed) ? parsed : {}) };
  } catch {
    values = { ...defaults };
  }
  return values;
}

export function flushSettings(): void {
  if (pendingWrite) {
    clearTimeout(pendingWrite);
    pendingWrite = null;
  }
  if (!values) {
    return;
  }
  const target = settingsFile();
  const temp = `${target}.tmp`;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(temp, JSON.stringify(values, null, 2));
  renameSync(temp, target);
}

export function getSetting(key: string): unknown {
  return load()[key] ?? null;
}

export function setSetting(key: string, value: unknown): void {
  load()[key] = value;
  if (pendingWrite) {
    clearTimeout(pendingWrite);
  }
  pendingWrite = setTimeout(flushSettings, WRITE_DELAY_MS);
}
