import { describe, expect, it } from 'vite-plus/test';

import { TEST_THEME, testMeasure } from '#charts/frame/chart-theme.fixture.ts';
import { wrapLines, trackedGaps } from '#charts/layout/text-measure.ts';

describe('wrapLines', () => {
  const style = TEST_THEME.text.axis;

  it('says when it had to cut the text, and keeps the cut line with its ellipsis in the width', () => {
    const text = 'Marketplace and third-party integrations revenue share';
    const width = testMeasure('Marketplace and third-party', style);
    const wrapped = wrapLines(text, width, { measure: testMeasure, style, maxLines: 1 });
    expect(wrapped.cut).toBe(true);
    expect(wrapped.lines).toEqual(['Marketplace and…']);
    expect(testMeasure(wrapped.lines[0] ?? '', style)).toBeLessThanOrEqual(width);
  });

  it('does not cut text that fits its lines', () => {
    const wrapped = wrapLines('Help centre content', 400, {
      measure: testMeasure,
      style,
      maxLines: 3,
    });
    expect(wrapped).toEqual({ lines: ['Help centre content'], cut: false });
  });
});

describe('trackedGaps', () => {
  it('counts positive tracking after every character and negative tracking between them', () => {
    const style = { ...TEST_THEME.text.stat, tracking: 0.05 };
    expect(trackedGaps('39 in 45', style)).toBe(8);
    expect(trackedGaps('39 in 45', { ...style, tracking: -0.045 })).toBe(7);
    expect(trackedGaps('', { ...style, tracking: -0.045 })).toBe(0);
  });
});
