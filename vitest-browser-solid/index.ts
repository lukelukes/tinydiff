// Code forked from: https://github.com/advancedtw/vitest-browser-solid

import { beforeEach } from 'vitest';
import { page } from 'vitest/browser';

import { cleanup, render } from './pure';

page.extend({
  render,
  [Symbol.for('vitest:component-cleanup')]: cleanup
});

beforeEach(() => {
  cleanup();
});

declare module 'vitest/browser' {
  interface BrowserPage {
    render: typeof render;
  }
}
