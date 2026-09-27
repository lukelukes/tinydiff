import * as fc from 'fast-check';

import type { FileEntry, GitStatus } from '#tauri-bindings/index';

const lowerAlphaNumChars = Array.from('abcdefghijklmnopqrstuvwxyz0123456789_-');
const lowerAlphaChars = Array.from('abcdefghijklmnopqrstuvwxyz');

const nameArb = fc.oneof(
  fc.constantFrom('a', 'b'),
  fc
    .tuple(
      fc.constantFrom(...lowerAlphaChars),
      fc.string({ unit: fc.constantFrom(...lowerAlphaNumChars), minLength: 0, maxLength: 10 })
    )
    .map(([first, rest]) => first + rest)
);

const extensionArb = fc.constantFrom('.ts', '.tsx', '.js', '.json', '.md', '');

const filePathArb = fc
  .tuple(fc.array(nameArb, { minLength: 0, maxLength: 4 }), nameArb, extensionArb)
  .map(([dirs, name, ext]) => [...dirs, `${name}${ext}`].join('/'));

const placementArb = fc.constantFrom('staged', 'unstaged', 'both');

function toEntry(path: string): FileEntry {
  return { path, kind: { status: 'modified' } };
}

export const gitStatusArb: fc.Arbitrary<GitStatus> = fc
  .uniqueArray(fc.tuple(filePathArb, placementArb), {
    selector: ([path]) => path,
    minLength: 0,
    maxLength: 30
  })
  .map((entries) => ({
    staged: entries.filter(([, placement]) => placement !== 'unstaged').map(([p]) => toEntry(p)),
    unstaged: entries.filter(([, placement]) => placement !== 'staged').map(([p]) => toEntry(p)),
    untracked: []
  }));
