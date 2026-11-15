import { loadBrand } from '@deckster/brand/node';
import { emptyFontPlan, type FontPlan, type RunStyle } from '@deckster/export';
import { NodeServices } from '@effect/platform-node';
import { expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import path from 'node:path';

import { pptxFonts } from '#export/export-fonts.ts';

/**
 * The framework's workspace, with the shipped brands.
 */
const WORKSPACE_ROOT = path.resolve(import.meta.dirname, '../../../..');

/**
 * A body run in the default brand.
 */
function body(): RunStyle {
  return {
    family: 'Inter',
    stack: 'Inter, sans-serif',
    size: 36,
    weight: 400,
    italic: false,
    color: '#161920',
    letterSpacing: 0,
    caps: 'none',
    underline: false,
    strike: false,
    shift: 'none',
    axes: { wght: 400 },
    ascent: 34,
    descent: 9,
  };
}

layer(NodeServices.layer)('PPTX fonts', (it) => {
  it.effect('names brand families with their substitute PANOSE when nothing is embedded', () =>
    Effect.gen(function* () {
      const brand = (yield* loadBrand(WORKSPACE_ROOT, 'default')).tokens;
      const fonts = pptxFonts(emptyFontPlan(brand), brand, { fonts: 'brand' });
      expect(fonts.embedded).toEqual([]);
      expect(fonts.theme.minor).toMatchObject({
        typeface: 'Inter',
        panose: '020B0604020202020204',
      });
      expect(fonts.resolve(body())).toMatchObject({
        typeface: '+mn-lt',
        bold: false,
        pitchFamily: 34,
      });
      expect(fonts.resolve({ ...body(), family: 'JetBrains Mono' })).toMatchObject({
        typeface: 'JetBrains Mono',
        pitchFamily: 49,
      });
      expect(fonts.resolve({ ...body(), family: 'emoji' })).toMatchObject({
        typeface: 'Arial',
        fallback: true,
      });
    }),
  );

  it.effect('sets brand families in their substitutes for --fonts system', () =>
    Effect.gen(function* () {
      const brand = (yield* loadBrand(WORKSPACE_ROOT, 'default')).tokens;
      const fonts = pptxFonts(emptyFontPlan(brand), brand, { fonts: 'system' });
      expect(fonts.theme.major.typeface).toBe('Arial');
      expect(fonts.resolve({ ...body(), family: 'JetBrains Mono' }).typeface).toBe('Courier New');
    }),
  );

  it.effect(
    'writes embedded instances, theme references for the theme fonts, and their slots',
    () =>
      Effect.gen(function* () {
        const brand = (yield* loadBrand(WORKSPACE_ROOT, 'default')).tokens;
        const empty = emptyFontPlan(brand);
        const plan: FontPlan = {
          ...empty,
          resolve: (style) =>
            style.family === 'Inter'
              ? {
                  typeface: 'Inter Deck Body',
                  bold: style.weight >= 600,
                  italic: false,
                  panose: '020B0604020202020204',
                  pitchFamily: 34,
                  charset: 0,
                }
              : null,
        };
        const fonts = pptxFonts(plan, brand, { fonts: 'brand' });
        expect(fonts.theme.minor.typeface).toBe('Inter Deck Body');
        expect(fonts.resolve(body()).typeface).toBe('+mn-lt');
        expect(fonts.resolve({ ...body(), weight: 650 })).toMatchObject({
          typeface: '+mn-lt',
          bold: true,
        });
      }),
  );
});
