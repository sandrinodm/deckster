import { describe, expect, it } from 'vite-plus/test';

import { deltaDirection, deltaText, deltaTone, splitStat } from '#layouts/stat-value.ts';

describe('splitStat', () => {
  it('separates the unit text around a number', () => {
    expect(splitStat('34%')).toEqual({ prefix: '', number: '34', suffix: '%', spaced: false });
    expect(splitStat('$18.6M')).toEqual({
      prefix: '$',
      number: '18.6',
      suffix: 'M',
      spaced: false,
    });
    expect(splitStat('1,240')).toEqual({ prefix: '', number: '1,240', suffix: '', spaced: false });
  });

  it('keeps the space between a number and its unit, so the unit never touches the figure', () => {
    expect(splitStat('4.1 °C')).toEqual({ prefix: '', number: '4.1', suffix: '°C', spaced: true });
    expect(splitStat('−2.8 °C')).toMatchObject({ number: '−2.8', spaced: true });
  });

  it('turns a typed hyphen into a minus sign and keeps a minus sign', () => {
    expect(splitStat('-31%')).toMatchObject({ prefix: '', number: '−31', suffix: '%' });
    expect(splitStat('−2.8 °C').number).toBe('−2.8');
  });

  it('sets a range as one figure, its hyphen as an en dash, with its unit after it', () => {
    expect(splitStat('12-15%')).toMatchObject({ number: '12–15', suffix: '%' });
    expect(splitStat('12–15%')).toMatchObject({ number: '12–15', suffix: '%' });
  });

  it('sets a comparison sign at the figure size, as part of the number', () => {
    expect(splitStat('<5 min')).toEqual({ prefix: '', number: '<5', suffix: 'min', spaced: true });
    expect(splitStat('~40%')).toMatchObject({ prefix: '', number: '~40', suffix: '%' });
  });

  it('keeps values with text between numbers, or no number, whole', () => {
    expect(splitStat('1 in 4')).toMatchObject({ prefix: '', number: '1 in 4', suffix: '' });
    expect(splitStat('Zero')).toMatchObject({ prefix: '', number: 'Zero', suffix: '' });
    expect(splitStat('Top 3')).toMatchObject({ prefix: '', number: 'Top 3', suffix: '' });
    expect(splitStat('24/7')).toMatchObject({ number: '24/7', suffix: '' });
  });
});

describe('deltas', () => {
  it('point the way the slide says when it sets a trend', () => {
    expect(deltaDirection('12 pts over target', 'up')).toBe('up');
    expect(deltaTone('12 pts over target', undefined, 'up')).toBe('positive');
    expect(deltaTone('fewer admissions', 'positive', 'down')).toBe('positive');
  });

  it('point up or down from their first character', () => {
    expect(deltaDirection('+12%')).toBe('up');
    expect(deltaDirection('▲ 4 pts')).toBe('up');
    expect(deltaDirection('−3 pts since 2016')).toBe('down');
    expect(deltaDirection('-3 pts')).toBe('down');
    expect(deltaDirection('flat on 2025')).toBe('flat');
  });

  it('are positive going up and negative going down unless the slide sets a tone', () => {
    expect(deltaTone('+12%', undefined)).toBe('positive');
    expect(deltaTone('−31%', undefined)).toBe('negative');
    expect(deltaTone('−31%', 'positive')).toBe('positive');
    expect(deltaTone('same as 2025', undefined)).toBe('neutral');
  });

  it('drop a leading arrow, which the layout draws itself, but keep signs', () => {
    expect(deltaText('▲ 4 pts')).toBe('4 pts');
    expect(deltaText('+12%')).toBe('+12%');
  });
});
