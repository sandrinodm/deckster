import { describe, expect, it } from 'vite-plus/test';

import { smartPunctuation } from '#foundation/smart-punctuation.ts';

describe('smartPunctuation', () => {
  it('curls double and single quotes and apostrophes', () => {
    expect(smartPunctuation('"Shade" is Riverside\'s edge')).toBe('“Shade” is Riverside’s edge');
    expect(smartPunctuation("she said 'not yet'")).toBe('she said ‘not yet’');
    expect(smartPunctuation("('quoted')")).toBe('(‘quoted’)');
  });

  it('keeps an apostrophe before an elided year', () => {
    expect(smartPunctuation("the summer of '26")).toBe('the summer of ’26');
  });

  it('continues from the character before the text', () => {
    expect(smartPunctuation('" and more', 'd')).toBe('” and more');
    expect(smartPunctuation('"start', ' ')).toBe('“start');
  });

  it('leaves hyphens, dots and dashes as written', () => {
    expect(smartPunctuation('pnpm deploy --env prod -- and so on...')).toBe(
      'pnpm deploy --env prod -- and so on...',
    );
  });

  it('returns typographic text unchanged', () => {
    const text = '“Already” curly — isn’t it';
    expect(smartPunctuation(text)).toBe(text);
  });
});
