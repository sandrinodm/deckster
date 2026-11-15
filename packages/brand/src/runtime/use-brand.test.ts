import { describe, expect, it, vi } from 'vite-plus/test';

import { getBrand } from '#runtime/use-brand.ts';

vi.mock('virtual:deck/brand', async () => {
  const { Effect } = await import('effect');
  const { resolveBrand } = await import('#resolve/resolve-brand.ts');
  const { testBrand } = await import('#test-brand.fixture.ts');
  return {
    default: Effect.runSync(resolveBrand(testBrand())).tokens,
    logoUrls: { primary: '/logos/mark.svg' },
  };
});

describe('getBrand', () => {
  it('returns a surface the brand has', () => {
    expect(getBrand('inverse').surface.name).toBe('inverse');
    expect(getBrand().logo.url).toBe('/logos/mark.svg');
  });

  it('refuses a surface named like an object property instead of returning it', () => {
    for (const name of ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty']) {
      expect(() => getBrand(name), name).toThrow(RangeError);
    }
  });
});
