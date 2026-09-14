import { describe, expect, it } from 'vitest';

import { clampToWorkArea, isWindowState } from './window-bounds';

const WORK_AREA = { x: 0, y: 0, width: 1920, height: 1080 };

describe('clampToWorkArea', () => {
  it('shifts a window whose title bar is above the work area back inside it', () => {
    expect(clampToWorkArea({ x: 0, y: -600, width: 900, height: 700 }, WORK_AREA)).toStrictEqual({
      x: 0,
      y: 0,
      width: 900,
      height: 700
    });
  });

  it('shifts a window hanging off the right and bottom edges back inside', () => {
    expect(clampToWorkArea({ x: 1500, y: 900, width: 900, height: 700 }, WORK_AREA)).toStrictEqual({
      x: 1020,
      y: 380,
      width: 900,
      height: 700
    });
  });

  it('caps the size to the work area and pins it to the work area origin', () => {
    expect(
      clampToWorkArea({ x: -50, y: 20, width: 3000, height: 2000 }, { ...WORK_AREA, x: 40, y: 30 })
    ).toStrictEqual({ x: 40, y: 30, width: 1920, height: 1080 });
  });

  it('leaves bounds that already fit untouched', () => {
    const bounds = { x: 100, y: 200, width: 900, height: 700 };
    expect(clampToWorkArea(bounds, WORK_AREA)).toStrictEqual(bounds);
  });
});

describe('isWindowState', () => {
  it('accepts integer bounds with a positive size and a boolean maximized flag', () => {
    expect(isWindowState({ bounds: { x: -1, y: 0, width: 1, height: 1 }, maximized: true })).toBe(
      true
    );
  });

  it('rejects malformed states', () => {
    expect(isWindowState(null)).toBe(false);
    expect(isWindowState({ bounds: null, maximized: false })).toBe(false);
    expect(isWindowState({ bounds: { x: 0, y: 0, width: 0, height: 1 }, maximized: false })).toBe(
      false
    );
    expect(isWindowState({ bounds: { x: 0.5, y: 0, width: 1, height: 1 }, maximized: false })).toBe(
      false
    );
    expect(isWindowState({ bounds: { x: 0, y: 0, width: 1, height: 1 }, maximized: 'yes' })).toBe(
      false
    );
  });
});
