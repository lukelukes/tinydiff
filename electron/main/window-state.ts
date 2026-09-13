import type { BrowserWindow, Rectangle } from 'electron';
import { screen } from 'electron';

import { readJson, userDataFile, writeJson } from './storage';

export interface WindowState {
  bounds: Rectangle;
  maximized: boolean;
}

export const DEFAULT_WINDOW_SIZE = { width: 1024, height: 768 };

const SAVE_DELAY_MS = 250;
const MIN_VISIBLE_PX = 100;

function stateFile(): string {
  return userDataFile('window-state.json');
}

function isRectangle(value: unknown): value is Rectangle {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { x, y, width, height } = value as Record<string, unknown>;
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    (width as number) > 0 &&
    (height as number) > 0
  );
}

function isWindowState(value: unknown): value is WindowState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { bounds, maximized } = value as Record<string, unknown>;
  return isRectangle(bounds) && typeof maximized === 'boolean';
}

function visibleArea(bounds: Rectangle, area: Rectangle): { width: number; height: number } {
  return {
    width: Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x),
    height: Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y)
  };
}

function isOnScreen(bounds: Rectangle): boolean {
  const visible = visibleArea(bounds, screen.getDisplayMatching(bounds).workArea);
  return visible.width >= MIN_VISIBLE_PX && visible.height >= MIN_VISIBLE_PX;
}

export function loadWindowState(): WindowState | null {
  const stored = readJson(stateFile());
  if (!isWindowState(stored) || !isOnScreen(stored.bounds)) {
    return null;
  }
  return stored;
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
    if (!win.isDestroyed()) {
      writeJson(stateFile(), snapshot(win));
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
