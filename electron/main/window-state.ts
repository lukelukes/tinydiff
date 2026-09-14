import type { BrowserWindow } from 'electron';
import { screen } from 'electron';

import { log } from './log';
import { readJson, userDataFile, writeJson } from './storage';
import type { WindowState } from './window-bounds';
import { clampToWorkArea, isWindowState } from './window-bounds';

export const DEFAULT_WINDOW_SIZE = { width: 1024, height: 768 };

const SAVE_DELAY_MS = 250;

function stateFile(): string {
  return userDataFile('window-state.json');
}

export function loadWindowState(): WindowState | null {
  const stored = readJson(stateFile());
  if (!isWindowState(stored)) {
    return null;
  }
  const { workArea } = screen.getDisplayMatching(stored.bounds);
  return { bounds: clampToWorkArea(stored.bounds, workArea), maximized: stored.maximized };
}

function snapshot(win: BrowserWindow): WindowState {
  return { bounds: win.getNormalBounds(), maximized: win.isMaximized() };
}

export function trackWindowState(win: BrowserWindow): void {
  let pending: NodeJS.Timeout | null = null;

  const cancel = (): void => {
    if (pending) {
      clearTimeout(pending);
      pending = null;
    }
  };

  const save = (): void => {
    cancel();
    if (win.isDestroyed()) {
      return;
    }
    try {
      writeJson(stateFile(), snapshot(win));
    } catch (error) {
      log(`window state not saved: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const schedule = (): void => {
    cancel();
    pending = setTimeout(save, SAVE_DELAY_MS);
  };

  win.on('resize', schedule);
  win.on('move', schedule);
  win.on('maximize', schedule);
  win.on('unmaximize', schedule);
  win.on('close', save);
}
