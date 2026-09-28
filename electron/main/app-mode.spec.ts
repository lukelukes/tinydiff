import { describe, expect, it } from 'vitest';

import { parseCli } from './app-mode';

interface Row {
  name: string;
  argv: string[];
  defaultApp: boolean;
}

describe('parseCli', () => {
  it.for<Row & { paths: string[] }>([
    {
      name: 'resolves positional paths against the working directory',
      argv: ['/opt/td', 'repo', '/abs/b.txt'],
      defaultApp: false,
      paths: ['/w/repo', '/abs/b.txt']
    },
    {
      name: 'yields no paths when launched bare',
      argv: ['/opt/td'],
      defaultApp: false,
      paths: []
    },
    {
      name: 'skips the app entry when launched through the electron binary',
      argv: ['/usr/bin/electron', '--inspect=0', 'out/main/index.js', 'repo'],
      defaultApp: true,
      paths: ['/w/repo']
    },
    {
      name: 'ignores chromium and electron switches',
      argv: ['/opt/td', '--no-sandbox', '--remote-debugging-port=0', 'a.txt', 'b.txt'],
      defaultApp: false,
      paths: ['/w/a.txt', '/w/b.txt']
    },
    {
      name: 'treats everything after -- as a path',
      argv: ['/opt/td', '--', '-left.txt', 'right.txt'],
      defaultApp: false,
      paths: ['/w/-left.txt', '/w/right.txt']
    },
    {
      name: 'keeps the -- terminator semantics when launched through the electron binary',
      argv: ['/usr/bin/electron', '.', '--', '--weird', 'b.txt'],
      defaultApp: true,
      paths: ['/w/--weird', '/w/b.txt']
    },
    {
      name: 'treats help and version flags after -- as paths',
      argv: ['/opt/td', '--', '--help', '-V'],
      defaultApp: false,
      paths: ['/w/--help', '/w/-V']
    },
    {
      name: 'leaves flags before the app entry to the electron binary',
      argv: ['/usr/bin/electron', '--version', 'out/main/index.js', 'repo'],
      defaultApp: true,
      paths: ['/w/repo']
    }
  ])('$name', ({ argv, defaultApp, paths }) => {
    expect(parseCli(argv, defaultApp, '/w')).toStrictEqual({ kind: 'paths', paths });
  });

  it.for<Row & { kind: 'help' | 'version' }>([
    { name: 'long help', argv: ['/opt/td', '--help'], defaultApp: false, kind: 'help' },
    { name: 'short help', argv: ['/opt/td', '-h'], defaultApp: false, kind: 'help' },
    { name: 'long version', argv: ['/opt/td', '--version'], defaultApp: false, kind: 'version' },
    { name: 'short version', argv: ['/opt/td', '-V'], defaultApp: false, kind: 'version' },
    {
      name: 'help alongside paths',
      argv: ['/opt/td', 'a.txt', '--help', 'b.txt'],
      defaultApp: false,
      kind: 'help'
    },
    {
      name: 'version after the app entry through the electron binary',
      argv: ['/usr/bin/electron', 'out/main/index.js', '--version'],
      defaultApp: true,
      kind: 'version'
    },
    {
      name: 'help before a -- terminator',
      argv: ['/opt/td', '-h', '--', 'a.txt'],
      defaultApp: false,
      kind: 'help'
    }
  ])('recognises $name', ({ argv, defaultApp, kind }) => {
    expect(parseCli(argv, defaultApp, '/w')).toStrictEqual({ kind });
  });
});
