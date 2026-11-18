import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';

import { affectsFallbacks } from '#brand/active-brand.ts';

const BRANDS = path.join('/workspace', 'brands');

describe('affectsFallbacks', () => {
  it('is true for any brand’s layouts.ts, added, changed or removed', () => {
    for (const event of ['add', 'change', 'unlink']) {
      expect(affectsFallbacks(BRANDS, event, path.join(BRANDS, 'other', 'layouts.ts'))).toBe(true);
    }
  });

  it('is true for a brand folder appearing or disappearing', () => {
    expect(affectsFallbacks(BRANDS, 'addDir', path.join(BRANDS, 'new'))).toBe(true);
    expect(affectsFallbacks(BRANDS, 'unlinkDir', path.join(BRANDS, 'old'))).toBe(true);
  });

  it('is false for other files and for paths outside brands', () => {
    expect(affectsFallbacks(BRANDS, 'change', path.join(BRANDS, 'other', 'brand.ts'))).toBe(false);
    expect(affectsFallbacks(BRANDS, 'addDir', path.join(BRANDS, 'other', 'art'))).toBe(false);
    expect(affectsFallbacks(BRANDS, 'change', '/workspace/decks/x/layouts.ts')).toBe(false);
  });
});
