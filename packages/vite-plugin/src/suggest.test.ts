import { describe, expect, it } from 'vite-plus/test';

import { suggest } from '#suggest.ts';

const FIELDS = ['layout', 'title', 'surface', 'budget'];

describe('suggest', () => {
  it('matches typos, swapped letters and case differences', () => {
    expect(suggest('layuot', FIELDS)).toBe('layout');
    expect(suggest('titel', FIELDS)).toBe('title');
    expect(suggest('Surfce', FIELDS)).toBe('surface');
  });

  it('suggests nothing for words more than two edits away', () => {
    expect(suggest('colour', FIELDS)).toBeUndefined();
    expect(suggest('x', [])).toBeUndefined();
  });
});
