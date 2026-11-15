import { Effect, Result } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import { formatHex, fromHex, isColorLiteral, parseColorLiteral } from '#color/color.ts';
import { closestLightness, searchLightness } from '#color/contrast.ts';
import { oklabToRgb } from '#color/oklab.ts';
import { resolveBrand } from '#resolve/resolve-brand.ts';
import { testBrand } from '#test-brand.fixture.ts';

/**
 * A chroma written with 400 digits, which `Number` reads as `Infinity`.
 */
const HUGE_CHROMA = `oklch(0.5 ${'9'.repeat(400)} 1)`;

describe('color literals', () => {
  it('refuse a chroma too large to be finite, without hanging', () => {
    const started = Date.now();
    expect(isColorLiteral(HUGE_CHROMA)).toBe(false);
    expect(parseColorLiteral(HUGE_CHROMA)).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('refuse numbers that are not numbers, such as ".."', () => {
    for (const text of [
      'oklch(0.5 .. 1)',
      'oklch(. 0.1 1)',
      'oklch(0.5 0.1 1.2.3)',
      'oklch(0.5 0.1 1 / .)',
      'oklch(0.5 1e3 1)',
      'oklch(0.5 0.1 1e999)',
      'oklch(1.5 0.1 1)',
      'oklch(150% 0.1 1)',
      'oklch(0.5 0.1 1 / 2)',
      'oklch(0.5 9 1)',
      'oklch(0.5 0.1 9999)',
    ]) {
      expect(isColorLiteral(text), text).toBe(false);
      expect(parseColorLiteral(text), text).toBeUndefined();
    }
  });

  it('still read the forms brands write', () => {
    for (const text of [
      'oklch(0.62 0.19 259)',
      'oklch(62% 0.19 259deg)',
      'oklch(0.5 0 0 / 0.7)',
      'oklch(.5 .1 10 / 50%)',
      'oklch(1 0.4 360)',
      '#abc',
      '#11223380',
    ]) {
      expect(isColorLiteral(text), text).toBe(true);
      expect(formatHex(parseColorLiteral(text)!), text).toMatch(/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/);
    }
  });

  it('fail the brand, rather than hang, for a crafted color', () => {
    const result = Effect.runSync(
      Effect.result(resolveBrand(testBrand({ 'color.palette.blue.600': HUGE_CHROMA }))),
    );
    expect(Result.isFailure(result)).toBe(true);
  });
});

describe('bounded searches', () => {
  it('map an infinite chroma into sRGB in a bounded number of steps', () => {
    const color = oklabToRgb({ l: 0.5, a: 1e300, b: 0 });
    expect([color.r, color.g, color.b].every(Number.isFinite)).toBe(true);
  });

  it('refuse a non-finite OKLab color instead of searching forever', () => {
    expect(() => oklabToRgb({ l: 0.5, a: Number.POSITIVE_INFINITY, b: 0 })).toThrow(TypeError);
    expect(() => oklabToRgb({ l: Number.NaN, a: 0, b: 0 })).toThrow(TypeError);
  });

  it('never format a non-finite channel as hex', () => {
    expect(() => formatHex({ r: Number.NaN, g: 0, b: 0, alpha: 1 })).toThrow(TypeError);
  });

  it('give up a lightness search that finds nothing, with undefined', () => {
    const gray = fromHex('#777777');
    expect(searchLightness(gray, 1, () => false)).toBeUndefined();
    expect(closestLightness(gray, () => false)).toBeUndefined();
  });
});
