import { describe, expect, it } from 'vite-plus/test';

import { fullDeckUrl, readEmbedMode } from '#embed/embed-mode.ts';

describe('readEmbedMode', () => {
  it('turns on for ?embed with no value or a true value', () => {
    for (const search of ['?embed', '?embed=', '?embed=1', '?embed=true', '?static&embed']) {
      expect(readEmbedMode(search), search).toBe(true);
    }
  });

  it('stays off without the parameter or with a false value', () => {
    for (const search of ['', '?static', '?embed=0', '?embed=false', '?embed=NO']) {
      expect(readEmbedMode(search), search).toBe(false);
    }
  });
});

describe('fullDeckUrl', () => {
  it('drops embed and adds the hash of the position', () => {
    const url = fullDeckUrl({ pathname: '/decks/hello/', search: '?embed' }, { slide: 1, step: 2 });
    expect(url).toBe('/decks/hello/#/2/2');
  });

  it('keeps the other query parameters', () => {
    const location = { pathname: '/', search: '?brand=nocturne&embed=1&x=a%20b' };
    expect(fullDeckUrl(location, { slide: 0, step: 0 })).toBe('/?brand=nocturne&x=a+b#/1/0');
  });

  it('works on a page opened without embed', () => {
    expect(fullDeckUrl({ pathname: '/deck/', search: '' }, { slide: 3, step: 0 })).toBe(
      '/deck/#/4/0',
    );
  });
});
