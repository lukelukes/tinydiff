import { load } from '@tauri-apps/plugin-store';

const STORE_PATH = '.tinydiff-settings.json';

class SettingsStore {
  private store: Awaited<ReturnType<typeof load>> | null = null;
  private initPromise: Promise<void> | null = null;

  private async init() {
    if (this.store) return;
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = (async () => {
      this.store = await load(STORE_PATH, { autoSave: true });
    })();

    await this.initPromise;
  }

  async get<T>(key: string): Promise<T | null> {
    await this.init();
    return (await this.store!.get<T>(key)) ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.init();
    await this.store!.set(key, value);
  }

  async delete(key: string): Promise<void> {
    await this.init();
    await this.store!.delete(key);
  }
}

export const settingsStore = new SettingsStore();
