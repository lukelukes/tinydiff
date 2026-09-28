import { describe, expect, it } from 'vitest';

import { rendererFilePath } from './renderer-path';

const root = '/opt/tinydiff/renderer';

describe('rendererFilePath', () => {
  it.for([
    {
      name: 'root path serves index.html',
      url: 'app://renderer/',
      want: '/opt/tinydiff/renderer/index.html'
    },
    {
      name: 'dot segment collapses to index.html',
      url: 'app://renderer/.',
      want: '/opt/tinydiff/renderer/index.html'
    },
    {
      name: 'top-level file',
      url: 'app://renderer/favicon.svg',
      want: '/opt/tinydiff/renderer/favicon.svg'
    },
    {
      name: 'nested asset',
      url: 'app://renderer/assets/workers/diff-worker-abc123.js',
      want: '/opt/tinydiff/renderer/assets/workers/diff-worker-abc123.js'
    },
    {
      name: 'query and hash are ignored',
      url: 'app://renderer/assets/index.js?v=1#top',
      want: '/opt/tinydiff/renderer/assets/index.js'
    },
    {
      name: 'dot-dot inside the root stays inside',
      url: 'app://renderer/assets/../index.html',
      want: '/opt/tinydiff/renderer/index.html'
    },
    {
      name: 'dot-dot above the root is clamped by url parsing',
      url: 'app://renderer/../../etc/passwd',
      want: '/opt/tinydiff/renderer/etc/passwd'
    },
    {
      name: 'percent-encoded dot-dot is clamped by url parsing',
      url: 'app://renderer/%2e%2e/%2E%2E/etc/passwd',
      want: '/opt/tinydiff/renderer/etc/passwd'
    },
    {
      name: 'encoded slash stays a literal file name',
      url: 'app://renderer/%2e%2e%2fetc%2fpasswd',
      want: '/opt/tinydiff/renderer/%2e%2e%2fetc%2fpasswd'
    },
    {
      name: 'encoded backslash stays a literal file name',
      url: 'app://renderer/%5c%2e%2e%5cetc',
      want: '/opt/tinydiff/renderer/%5c%2e%2e%5cetc'
    }
  ])('$name: $url', ({ url, want }) => {
    expect(rendererFilePath(url, root)).toBe(want);
  });

  it.for([
    { name: 'the root directory itself', url: 'app://renderer' },
    { name: 'wrong host', url: 'app://other/index.html' },
    { name: 'host with a port', url: 'app://renderer:80/index.html' },
    { name: 'host with credentials suffix', url: 'app://renderer@evil/index.html' },
    { name: 'dot-dot joined by an encoded slash', url: 'app://renderer/..%2f..%2fetc%2fpasswd' },
    { name: 'dot-dot joined by backslashes', url: 'app://renderer/..\\..\\etc\\passwd' },
    { name: 'dot-dot joined by encoded backslashes', url: 'app://renderer/..%5c..%5cetc' }
  ])('rejects $name: $url', ({ url }) => {
    expect(rendererFilePath(url, root)).toBeNull();
  });
});
