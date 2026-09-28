import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { SettingKey, Settings, SettingsError } from '../../src/bindings/settings';
import { defaultSettings, settingOptions } from '../../src/bindings/settings';
import type { Result } from '../../src/bindings/types';

type SettingsResult = Result<null, SettingsError>;

export type SettingsStore = ReturnType<typeof createSettings>;

function failure(message: string): SettingsResult {
  return { status: 'error', error: { type: 'settings', message } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSettingKey(key: unknown): key is SettingKey {
  return typeof key === 'string' && Object.hasOwn(settingOptions, key);
}

function isSettingValue<K extends SettingKey>(key: K, value: unknown): value is Settings[K] {
  const options: readonly unknown[] = settingOptions[key];
  return options.includes(value);
}

function readStored(file: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function load(file: string): Settings {
  const stored = readStored(file);
  const pick = <K extends SettingKey>(key: K): Settings[K] => {
    const value = stored[key];
    return isSettingValue(key, value) ? value : defaultSettings[key];
  };
  return { theme: pick('theme'), viewMode: pick('viewMode') };
}

function persist(file: string, settings: Settings): SettingsResult {
  const temp = `${file}.tmp`;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(temp, JSON.stringify(settings, null, 2));
    renameSync(temp, file);
    return { status: 'ok', data: null };
  } catch (error) {
    if (existsSync(temp)) {
      rmSync(temp);
    }
    return failure(
      `failed to write ${file}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function createSettings(file: string) {
  let committed = load(file);

  return {
    get: <K extends SettingKey>(key: K): Settings[K] => {
      if (!isSettingKey(key)) {
        throw new Error(`unknown setting ${String(key)}`);
      }
      return committed[key];
    },
    set: (key: unknown, value: unknown): SettingsResult => {
      if (!isSettingKey(key)) {
        return failure(`unknown setting ${String(key)}`);
      }
      if (!isSettingValue(key, value)) {
        return failure(`${key} must be one of ${settingOptions[key].join(', ')}`);
      }
      const next: Settings = { ...committed, [key]: value };
      const result = persist(file, next);
      if (result.status === 'ok') {
        committed = next;
      }
      return result;
    }
  };
}
