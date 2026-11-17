import { describe, expect, it } from 'vite-plus/test';

import { readQueryFlag } from '#url/query-flag.ts';

describe('readQueryFlag', () => {
  it('turns on for the bare parameter, an empty value or a true value', () => {
    for (const search of ['?flag', '?flag=', '?flag=1', '?flag=true', 'flag', '?a=1&flag']) {
      expect(readQueryFlag(search, 'flag'), search).toBe(true);
    }
  });

  it('stays off without the parameter or with a false value in any case', () => {
    for (const search of ['', '?', '?other', '?flag=0', '?flag=false', '?flag=No', '?flags']) {
      expect(readQueryFlag(search, 'flag'), search).toBe(false);
    }
  });
});
