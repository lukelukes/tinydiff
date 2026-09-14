import type { Result, SettingsError } from '#bindings/index';

export type Theme = 'dark' | 'light';

export type ViewMode = 'split' | 'unified';

interface Settings {
  theme: Theme;
  viewMode: ViewMode;
}

type SettingKey = keyof Settings;

const guards: { [K in SettingKey]: (value: unknown) => value is Settings[K] } = {
  theme: (value): value is Theme => value === 'dark' || value === 'light',
  viewMode: (value): value is ViewMode => value === 'split' || value === 'unified'
};

export const settingsStore = {
  async get<K extends SettingKey>(key: K): Promise<Settings[K] | null> {
    const value = await window.tinydiff.settingsGet(key);
    const isValid: (value: unknown) => value is Settings[K] = guards[key];
    return isValid(value) ? value : null;
  },
  set<K extends SettingKey>(key: K, value: Settings[K]): Promise<Result<null, SettingsError>> {
    return window.tinydiff.settingsSet(key, value);
  }
};
