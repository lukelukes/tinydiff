import { describe, expect, it } from 'vitest';

import { cliPaths } from './app-mode';

describe('cliPaths', () => {
  it('resolves positional paths against the working directory', () => {
    expect(cliPaths(['/opt/td', 'repo', '/abs/b.txt'], false, '/work')).toStrictEqual([
      '/work/repo',
      '/abs/b.txt'
    ]);
  });

  it('skips the app entry when launched through the electron binary', () => {
    expect(
      cliPaths(['/usr/bin/electron', '--inspect=0', 'out/main/index.js', 'repo'], true, '/work')
    ).toStrictEqual(['/work/repo']);
  });

  it('ignores chromium and electron switches', () => {
    expect(
      cliPaths(
        ['/opt/td', '--no-sandbox', '--remote-debugging-port=0', 'a.txt', 'b.txt'],
        false,
        '/w'
      )
    ).toStrictEqual(['/w/a.txt', '/w/b.txt']);
  });

  it('treats everything after -- as a path', () => {
    expect(cliPaths(['/opt/td', '--', '-left.txt', 'right.txt'], false, '/w')).toStrictEqual([
      '/w/-left.txt',
      '/w/right.txt'
    ]);
  });

  it('keeps the -- terminator semantics when launched through the electron binary', () => {
    expect(
      cliPaths(['/usr/bin/electron', '.', '--', '--weird', 'b.txt'], true, '/w')
    ).toStrictEqual(['/w/--weird', '/w/b.txt']);
  });
});
