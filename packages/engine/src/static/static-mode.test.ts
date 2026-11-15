import { describe, expect, it } from 'vite-plus/test';

import { readStaticMode } from '#static/static-mode.ts';

describe('readStaticMode', () => {
  it('turns on for ?static with no value or a true value', () => {
    for (const search of [
      '?static',
      '?static=',
      '?static=1',
      '?static=true',
      'static',
      '?a=1&static',
    ]) {
      expect(readStaticMode(search), search).toBe(true);
    }
  });

  it('stays off without the parameter or with a false value', () => {
    for (const search of ['', '?', '?other', '?static=0', '?static=false', '?static=No']) {
      expect(readStaticMode(search), search).toBe(false);
    }
  });
});
