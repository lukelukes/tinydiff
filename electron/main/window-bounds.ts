import type { Rectangle } from 'electron';

export interface WindowState {
  bounds: Rectangle;
  maximized: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function isRectangle(value: unknown): value is Rectangle {
  if (!isRecord(value)) {
    return false;
  }
  const { x, y, width, height } = value;
  return (
    isInteger(x) && isInteger(y) && isInteger(width) && width > 0 && isInteger(height) && height > 0
  );
}

export function isWindowState(value: unknown): value is WindowState {
  if (!isRecord(value)) {
    return false;
  }
  const { bounds, maximized } = value;
  return isRectangle(bounds) && typeof maximized === 'boolean';
}

export function clampToWorkArea(bounds: Rectangle, workArea: Rectangle): Rectangle {
  const width = Math.min(bounds.width, workArea.width);
  const height = Math.min(bounds.height, workArea.height);
  return {
    x: Math.min(Math.max(bounds.x, workArea.x), workArea.x + workArea.width - width),
    y: Math.min(Math.max(bounds.y, workArea.y), workArea.y + workArea.height - height),
    width,
    height
  };
}
