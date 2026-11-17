import { describe, expect, it } from 'vite-plus/test';

import { splitStat } from '#layouts/stat-value.ts';
import { countText, parseCount, type CountValue } from '#motion/count-up.ts';

/**
 * The figure a number part parses to; the test fails when it does not count.
 */
function counted(number: string): CountValue {
  const count = parseCount(number);
  if (count === undefined) {
    throw new Error(`${number} does not count`);
  }

  return count;
}

describe('parseCount', () => {
  it('counts plain figures with a sign, thousands separators and decimals', () => {
    expect(parseCount('18.6')).toEqual({
      text: '18.6',
      sign: '',
      magnitude: 18.6,
      decimals: 1,
      grouped: false,
    });
    expect(parseCount('1,250,000')).toMatchObject({ magnitude: 1_250_000, grouped: true });
    expect(parseCount('−12')).toMatchObject({ sign: '−', magnitude: 12 });
    expect(parseCount('+40')).toMatchObject({ sign: '+', magnitude: 40 });
    expect(parseCount('3.9')).toMatchObject({ magnitude: 3.9, decimals: 1 });
  });

  it('leaves comparisons, ranges, text, years and other separators still', () => {
    for (const number of ['<5', '~40', '12–15', '1 in 4', 'Zero', '2025', '1.234,5', '12 000']) {
      expect(parseCount(number), number).toBeUndefined();
    }
  });

  it('leaves zero, figures with fewer than ten steps, and ones it cannot write back still', () => {
    for (const number of ['0', '0.0', '2', '7', '0.5', '007', '1,00', '12.']) {
      expect(parseCount(number), number).toBeUndefined();
    }
  });

  it('reads the number part splitStat gives, with the units outside it', () => {
    expect(parseCount(splitStat('$18.6M').number)?.magnitude).toBe(18.6);
    expect(parseCount(splitStat('-12%').number)?.sign).toBe('−');
    expect(parseCount(splitStat('2 days').number)).toBeUndefined();
    expect(parseCount(splitStat('3.9x').number)?.magnitude).toBe(3.9);
    expect(parseCount(splitStat('12–15 weeks').number)).toBeUndefined();
  });
});

describe('countText', () => {
  it('ends on the figure exactly as written', () => {
    for (const number of ['18.6', '1,250,000', '−12', '+40', '3.90', '1,000.05']) {
      expect(countText(counted(number), 1), number).toBe(number);
      expect(countText(counted(number), 1.2), number).toBe(number);
    }
  });

  it('keeps the decimals and separators at every point and starts from zero', () => {
    expect(countText(counted('1,250,000'), 0)).toBe('0');
    expect(countText(counted('1,250,000'), 0.5)).toBe('625,000');
    expect(countText(counted('1,250,000'), 0.9)).toBe('1,125,000');
    expect(countText(counted('3.90'), 0)).toBe('0.00');
    expect(countText(counted('3.90'), 0.5)).toBe('1.95');
    expect(countText(counted('18.6'), -1)).toBe('0.0');
  });

  it('keeps a plus sign throughout and writes a minus sign once the value leaves zero', () => {
    expect(countText(counted('+40'), 0)).toBe('+0');
    expect(countText(counted('+40'), 0.5)).toBe('+20');
    expect(countText(counted('−12'), 0)).toBe('0');
    expect(countText(counted('−12'), 0.5)).toBe('−6');
  });

  it('never writes more characters than the final figure', () => {
    for (const number of ['99.9', '1,000', '+100', '−10']) {
      const count = counted(number);
      for (let step = 0; step <= 100; step += 1) {
        expect(countText(count, step / 100).length, `${number} at ${step}%`).toBeLessThanOrEqual(
          number.length,
        );
      }
    }
  });
});
