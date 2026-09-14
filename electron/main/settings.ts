import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { app } from 'electron';

import type { SettingsError } from '../../src/bindings/api';
import type { Result } from '../../src/bindings/types';
import { log } from './log';

const allowed = {
  theme: ['dark', 'light'],
  viewMode: ['split', 'unified']
} as const;

type SettingKey = keyof typeof allowed;

type Settings = { [K in SettingKey]: (typeof allowed)[K][number] };

type SettingsResult = Result<null, SettingsError>;

const defaults: Settings = { theme: 'dark', viewMode: 'split' };

const WRITE_DELAY_MS = 100;

let values: Settings | null = null;
let dirty = false;
let pendingWrite: NodeJS.Timeout | null = null;
let waiters: ((result: SettingsResult) => void)[] = [];

function settingsFile(): string {
  return join(app.getPath('userData'), 'settings.json');
}

function failure(message: string): SettingsResult {
  return { status: 'error', error: { type: 'settings', message } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(allowed, key);
}

function isAllowedValue<K extends SettingKey>(key: K, value: unknown): value is Settings[K] {
  const options: readonly unknown[] = allowed[key];
  return options.includes(value);
}

function readStored(): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(settingsFile(), 'utf8'));
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function read<K extends SettingKey>(stored: Record<string, unknown>, key: K): Settings[K] {
  const value = stored[key];
  return isAllowedValue(key, value) ? value : defaults[key];
}

function load(): Settings {
  if (values) {
    return values;
  }
  const stored = readStored();
  values = { theme: read(stored, 'theme'), viewMode: read(stored, 'viewMode') };
  return values;
}

function store<K extends SettingKey>(key: K, value: Settings[K]): void {
  load()[key] = value;
  dirty = true;
}

function discard(temp: string): void {
  try {
    rmSync(temp, { force: true });
  } catch {
    return;
  }
}

function write(): SettingsResult {
  if (!values || !dirty) {
    return { status: 'ok', data: null };
  }
  const target = settingsFile();
  const temp = `${target}.tmp`;
  try {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(temp, JSON.stringify(values, null, 2));
    renameSync(temp, target);
  } catch (error) {
    discard(temp);
    const message = `failed to write ${target}: ${error instanceof Error ? error.message : String(error)}`;
    log(message);
    return failure(message);
  }
  dirty = false;
  return { status: 'ok', data: null };
}

export function flushSettings(): SettingsResult {
  if (pendingWrite) {
    clearTimeout(pendingWrite);
    pendingWrite = null;
  }
  const result = write();
  const settled = waiters;
  waiters = [];
  for (const resolve of settled) {
    resolve(result);
  }
  return result;
}

function scheduleFlush(): Promise<SettingsResult> {
  if (pendingWrite) {
    clearTimeout(pendingWrite);
  }
  pendingWrite = setTimeout(() => {
    flushSettings();
  }, WRITE_DELAY_MS);
  return new Promise((resolve) => {
    waiters.push(resolve);
  });
}

export function getSetting(key: string): unknown {
  return isSettingKey(key) ? load()[key] : null;
}

export function setSetting(key: unknown, value: unknown): Promise<SettingsResult> {
  if (typeof key !== 'string') {
    return Promise.resolve(failure('settings key must be a string'));
  }
  if (!isSettingKey(key)) {
    return Promise.resolve(failure(`unknown setting ${key}`));
  }
  if (!isAllowedValue(key, value)) {
    return Promise.resolve(failure(`${key} must be one of ${allowed[key].join(', ')}`));
  }
  store(key, value);
  return scheduleFlush();
}
