import { describe, expect, it } from 'vite-plus/test';

import { deltaE, simulateColorVision } from '#color/color-vision.ts';
import { formatHex, fromHex, parseColorLiteral } from '#color/color.ts';
import { contrastRatio, ensureContrast } from '#color/contrast.ts';

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio(fromHex('#000000'), fromHex('#ffffff'))).toBeCloseTo(21, 5);
    expect(contrastRatio(fromHex('#767676'), fromHex('#ffffff'))).toBeCloseTo(4.54, 2);
    expect(contrastRatio(fromHex('#ffffff'), fromHex('#ffffff'))).toBe(1);
  });

  it('paints a translucent foreground over the background first', () => {
    const half = { ...fromHex('#000000'), alpha: 0.5 };
    expect(contrastRatio(half, fromHex('#ffffff'))).toBeCloseTo(
      contrastRatio(fromHex('#808080'), fromHex('#ffffff')),
      1,
    );
  });
});

describe('ensureContrast', () => {
  it('moves lightness away from the background until the ratio is reached', () => {
    const adjusted = ensureContrast(fromHex('#9aa1ae'), fromHex('#ffffff'), 4.5);
    expect(contrastRatio(adjusted, fromHex('#ffffff'))).toBeGreaterThanOrEqual(4.5);
    expect(formatHex(adjusted)).not.toBe('#000000');
  });

  it('tries the other side when the near side cannot reach the ratio', () => {
    const adjusted = ensureContrast(fromHex('#ffffff'), fromHex('#5b7cff'), 4.5);
    expect(contrastRatio(adjusted, fromHex('#5b7cff'))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('parseColorLiteral', () => {
  it('reads hex in every length and oklch, mapping out-of-gamut colors into sRGB', () => {
    expect(formatHex(parseColorLiteral('#abc')!)).toBe('#aabbcc');
    expect(formatHex(parseColorLiteral('#11223380')!)).toBe('#11223380');
    expect(formatHex(parseColorLiteral('oklch(0.628 0.2577 29.23)')!)).toBe('#ff0000');
    expect(formatHex(parseColorLiteral('oklch(70% 0.4 145)')!)).toMatch(/^#[0-9a-f]{6}$/);
    expect(parseColorLiteral('red')).toBeUndefined();
  });
});

describe('color-vision simulation', () => {
  it('collapses red against green under deuteranopia but not with normal vision', () => {
    const red = fromHex('#d03030');
    const green = fromHex('#3a9a3a');
    expect(deltaE(red, green)).toBeGreaterThan(30);
    const simulated = deltaE(
      simulateColorVision(red, 'deuteranopia'),
      simulateColorVision(green, 'deuteranopia'),
    );
    expect(simulated).toBeLessThan(10);
  });
});
