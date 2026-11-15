import { describe, expect, it } from '@effect/vitest';
import { Effect, Result } from 'effect';

import { checkTextColors } from '#checks/contrast-checks.ts';
import { fromHex } from '#color/color.ts';
import { contrastRatio, worstContrast } from '#color/contrast.ts';
import { oklabToOklch, rgbToOklab } from '#color/oklab.ts';
import { compileBrand } from '#compile/compile-brand.ts';
import { resolveBrand } from '#resolve/resolve-brand.ts';
import { TEXT_TONES, textBackgrounds } from '#resolve/text-colors.ts';
import { testBrand } from '#test-brand.fixture.ts';
import { decodeBrand } from '#validate/decode-brand.ts';

/**
 * The test brand with its accent, positive and negative held only to 3:1 on white (about 4.2:1,
 * 3.4:1 and 3.7:1), and black text on the accent so the accent fill still passes.
 */
const WEAK_ROLES = testBrand({
  'color.roles.accent': '#4f6ffa',
  'color.roles.accent-fg': '#000000',
  'color.roles.positive': '#1f9aa8',
  'color.roles.negative': '#e2583c',
});

/**
 * The OKLCH hue of a hex color, in degrees.
 */
function hueOf(hex: string): number {
  return oklabToOklch(rgbToOklab(fromHex(hex))).h;
}

describe('the text colors of a surface', () => {
  it.effect('move a role held to 3:1 until small text in it reads at 4.5:1, keeping its hue', () =>
    Effect.gen(function* () {
      const { tokens, warnings } = yield* resolveBrand(WEAK_ROLES);
      expect(warnings).toEqual([]);
      for (const surface of Object.values(tokens.surfaces)) {
        const backgrounds = textBackgrounds(surface.backdrop, surface.data.plate);
        for (const tone of TEXT_TONES) {
          const text = surface.text[tone];
          expect(
            worstContrast(fromHex(text), backgrounds),
            `${surface.name} ${tone}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }

      const base = tokens.surfaces.default!;
      expect(contrastRatio(fromHex(base.roles.accent), fromHex(base.roles.bg))).toBeLessThan(4.5);
      expect(base.text.accent).not.toBe(base.roles.accent);
      expect(Math.abs(hueOf(base.text.accent) - hueOf(base.roles.accent))).toBeLessThan(6);
    }),
  );

  it.effect('keep a role that already reads at 4.5:1 exactly as it is', () =>
    Effect.gen(function* () {
      const { tokens } = yield* resolveBrand(testBrand());
      const base = tokens.surfaces.default!;
      expect(base.text.accent).toBe(base.roles.accent);
      expect(base.text.positive).toBe(base.roles.positive);
    }),
  );

  it.effect('compile to --brand-color-<role>-text on every surface and to Tailwind classes', () =>
    Effect.gen(function* () {
      const { tokens } = yield* resolveBrand(WEAK_ROLES);
      const { css, tailwind } = compileBrand(tokens);
      for (const surface of Object.values(tokens.surfaces)) {
        expect(css).toContain(`--brand-color-accent-text: ${surface.text.accent}`);
        expect(css).toContain(`--brand-color-negative-text: ${surface.text.negative}`);
      }

      expect(tailwind).toContain('--color-accent-text: var(--brand-color-accent-text)');
      expect(tailwind).toContain('--color-positive-text: var(--brand-color-positive-text)');
    }),
  );
});

describe('the brand check of text colors', () => {
  it.effect('reports a text color that falls short at the role it comes from, with a fix', () =>
    Effect.gen(function* () {
      const { tokens } = yield* resolveBrand(WEAK_ROLES);
      const brand = Result.getOrThrow(decodeBrand(WEAK_ROLES));
      const base = tokens.surfaces.default!;
      expect(checkTextColors(brand, base)).toEqual([]);
      const tampered = { ...base, text: { ...base.text, accent: base.roles.accent } };
      expect(checkTextColors(brand, tampered)).toEqual([
        expect.objectContaining({
          path: 'color.roles.accent',
          message: expect.stringContaining('no accent color for small text reaches 4.5:1'),
          fix: expect.stringContaining('`fg`'),
        }),
      ]);
    }),
  );
});
