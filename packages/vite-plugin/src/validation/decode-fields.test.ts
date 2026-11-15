import { describe, expect, it } from 'vite-plus/test';

import { describeGiven } from '#validation/decode-fields.ts';

describe('describeGiven', () => {
  it('counts the items of a list', () => {
    expect(describeGiven([1, 2, 3, 4, 5, 6, 7, 8])).toBe('a list of 8 items');
    expect(describeGiven(['one'])).toBe('a list of 1 item');
  });

  it('gives a long string by its start and its length, not whole', () => {
    const title = 'Canopy survey results by district, with the aerial counts';
    expect(describeGiven(title)).toBe(`"Canopy survey results b…" (${title.length} characters)`);
  });

  it('quotes short values whole', () => {
    expect(describeGiven('Why')).toBe('"Why"');
    expect(describeGiven(7)).toBe('7');
    expect(describeGiven({ a: 1 })).toBe('a set of fields');
  });
});
