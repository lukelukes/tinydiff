import type * as Native from '../../crates/tinydiff-napi/index';
import type { SettingKey, Settings, SettingsError } from './settings';
import type { AppMode, Result } from './types';

export type NativeAddon = typeof Native;

export type TinydiffApi = Omit<NativeAddon, 'resolveAppMode' | 'readFile'> & {
  getAppMode: () => Promise<AppMode>;
  readFile: (filePath: string) => ReturnType<NativeAddon['readFile']>;
  settingsGet: <K extends SettingKey>(key: K) => Promise<Settings[K]>;
  settingsSet: <K extends SettingKey>(
    key: K,
    value: Settings[K]
  ) => Promise<Result<null, SettingsError>>;
};

declare global {
  interface Window {
    tinydiff: TinydiffApi;
  }
}
