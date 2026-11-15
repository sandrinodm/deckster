import { describe, expect, it } from 'vite-plus/test';

import { suggest } from '#validate/suggest.ts';

describe('suggest', () => {
  it('suggests a name within two edits, a swap counting as one', () => {
    expect(suggest('acnet', ['accent', 'muted'])).toBe('accent');
    expect(suggest('xyz', ['accent', 'muted'])).toBeUndefined();
  });

  it('answers at once for a very long input', () => {
    const started = Date.now();
    const names = Array.from({ length: 200 }, (_, index) => `name-${index}`);
    expect(suggest('x'.repeat(1_000_000), names)).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
