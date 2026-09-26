import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSettings } from './settings';

describe('settings', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tinydiff-settings-'));
    file = join(dir, 'nested', 'settings.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves defaults when nothing is stored', () => {
    const settings = createSettings(file);
    expect([settings.get('theme'), settings.get('viewMode')]).toStrictEqual(['dark', 'split']);
  });

  it('falls back to defaults for stored values outside the schema', () => {
    const stored = join(dir, 'settings.json');
    writeFileSync(stored, JSON.stringify({ theme: 'blue', viewMode: 'unified' }));
    const settings = createSettings(stored);
    expect([settings.get('theme'), settings.get('viewMode')]).toStrictEqual(['dark', 'unified']);
  });

  it('persists a valid value before publishing it', () => {
    expect(createSettings(file).set('theme', 'light')).toStrictEqual({ status: 'ok', data: null });
    expect(JSON.parse(readFileSync(file, 'utf8'))).toStrictEqual({
      theme: 'light',
      viewMode: 'split'
    });
    expect(createSettings(file).get('theme')).toBe('light');
  });

  it('rejects unknown keys and values without writing', () => {
    const settings = createSettings(file);
    expect(settings.set('fontSize', 12)).toMatchObject({ status: 'error' });
    expect(settings.set('viewMode', 'sideways')).toMatchObject({ status: 'error' });
    expect(existsSync(file)).toBe(false);
    expect(() => {
      Reflect.apply(settings.get, undefined, ['fontSize']);
    }).toThrow('unknown setting fontSize');
  });

  it('keeps the committed value when the write fails', () => {
    const blocker = join(dir, 'blocker');
    writeFileSync(blocker, '');
    const settings = createSettings(join(blocker, 'settings.json'));

    expect(settings.set('theme', 'light')).toMatchObject({
      status: 'error',
      error: { type: 'settings' }
    });
    expect(settings.get('theme')).toBe('dark');
  });
});
