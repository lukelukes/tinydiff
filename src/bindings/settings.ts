export const settingOptions = {
  theme: ['dark', 'light'],
  viewMode: ['split', 'unified']
} as const;

export type SettingKey = keyof typeof settingOptions;

export type Settings = { [K in SettingKey]: (typeof settingOptions)[K][number] };

export type SettingsError = { type: 'settings'; message: string };

export const defaultSettings: Settings = { theme: 'dark', viewMode: 'split' };
