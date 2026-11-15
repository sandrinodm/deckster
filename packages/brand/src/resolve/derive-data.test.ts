import { describe, expect, it } from 'vite-plus/test';

import { CONTEXT_CONTRAST } from '#checks/data-thresholds.ts';
import { fromHex } from '#color/color.ts';
import { contrastRatio } from '#color/contrast.ts';
import { contextFits, fitContext } from '#resolve/derive-data.ts';

/**
 * A light plate and a dark one.
 */
const PLATES = {
  /**
   * The default brand's background.
   */
  light: fromHex('#fcfcfd'),

  /**
   * Nocturne's background.
   */
  dark: fromHex('#0b0911'),
} as const;

describe('contextFits', () => {
  it('accepts a context color from 3:1 up to under 4.5:1 and nothing fainter or stronger', () => {
    expect(contextFits('#c2c7d1', PLATES.light)).toBe(false);
    expect(contextFits('#8d929b', PLATES.light)).toBe(true);
    expect(contextFits('#161920', PLATES.light)).toBe(false);
  });
});

describe('fitContext', () => {
  it('moves a faint context color to just above 3:1 on a light and a dark plate', () => {
    for (const [hex, plate] of [
      ['#c2c7d1', PLATES.light],
      ['#433a63', PLATES.dark],
    ] as const) {
      const fitted = fitContext(hex, plate);
      const ratio = contrastRatio(fromHex(fitted), plate);
      expect(ratio).toBeGreaterThanOrEqual(CONTEXT_CONTRAST);
      expect(ratio).toBeLessThan(3.4);
    }
  });

  it('keeps a context color that already fits', () => {
    expect(fitContext('#8d929b', PLATES.light)).toBe('#8d929b');
  });
});
