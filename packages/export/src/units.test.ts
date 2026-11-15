import { describe, expect, it } from 'vite-plus/test';

import {
  cssAngleToDrawing,
  EMU_PER_PX,
  exactSpacingBaseline,
  fontSizeHundredths,
  fractionToDrawing,
  lineSpacingPercent,
  maxOf,
  minOf,
  pointsHundredths,
  pxToEmu,
  SLIDE_SIZE_EMU,
} from '#units.ts';

describe('units', () => {
  it('maps the 1920-pixel canvas onto the 13.333-inch widescreen slide', () => {
    expect(EMU_PER_PX).toBe(6350);
    expect(SLIDE_SIZE_EMU).toEqual({ width: 12_192_000, height: 6_858_000 });
    expect(pxToEmu(1.5)).toBe(9525);
  });

  it('turns canvas pixels into points at half a point per pixel', () => {
    expect(fontSizeHundredths(160)).toBe(8000);
    expect(fontSizeHundredths(1)).toBe(100);
    expect(fontSizeHundredths(100_000)).toBe(400_000);
    expect(pointsHundredths(-1.6)).toBe(-80);
  });

  it('measures DrawingML angles from the right where CSS measures from the top', () => {
    expect(cssAngleToDrawing(90)).toBe(0);
    expect(cssAngleToDrawing(180)).toBe(5_400_000);
    expect(cssAngleToDrawing(0)).toBe(16_200_000);
    expect(cssAngleToDrawing(-270)).toBe(0);
  });

  it('clamps fractions to DrawingML percentages', () => {
    expect(fractionToDrawing(0.25)).toBe(25_000);
    expect(fractionToDrawing(2)).toBe(100_000);
    expect(fractionToDrawing(-1)).toBe(0);
  });

  it('writes a CSS line height as a share of the 1.2 em single line', () => {
    expect(lineSpacingPercent(1.2)).toBe(100_000);
    expect(lineSpacingPercent(1.04)).toBe(86_667);
    expect(lineSpacingPercent(1.5)).toBe(125_000);
  });

  it('puts an exactly spaced baseline a fifth of an em above the line bottom', () => {
    expect(exactSpacingBaseline(156.8, 160)).toBeCloseTo(124.8, 5);
    expect(exactSpacingBaseline(48, 32)).toBeCloseTo(41.6, 5);
  });
});

describe('maxOf and minOf', () => {
  it('match Math.max and Math.min, with an optional bound that joins the values', () => {
    expect(maxOf([3, 9, 4])).toBe(9);
    expect(minOf([3, 9, 4])).toBe(3);
    expect(maxOf([-3, -9], 0)).toBe(0);
    expect(minOf([3, 9], 1)).toBe(1);
    expect(maxOf([])).toBe(-Infinity);
    expect(minOf([])).toBe(Infinity);
  });

  it('handle more values than a function call can take as arguments', () => {
    const values = Array.from({ length: 2_000_000 }, (_, index) => index);
    expect(() => Math.max(...values)).toThrow(RangeError);
    expect(maxOf(values)).toBe(1_999_999);
    expect(minOf(values)).toBe(0);
  });
});
