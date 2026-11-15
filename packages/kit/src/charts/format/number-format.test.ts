import { describe, expect, it } from 'vite-plus/test';

import {
  defaultRelative,
  excelFormat,
  formatChange,
  formatValue,
  itemFormat,
  resolveFormat,
  runFormatter,
  tickDigits,
  tickTexts,
} from '#charts/format/number-format.ts';

const DEFAULTS = {
  locale: 'en-US',
  notation: 'compact',
  currency: 'USD',
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
} as const;

describe('resolveFormat', () => {
  it('takes the brand defaults when the chart sets nothing', () => {
    expect(resolveFormat(undefined, undefined, DEFAULTS)).toEqual({
      locale: 'en-US',
      style: 'number',
      notation: 'compact',
      currency: 'USD',
      digits: 1,
      minDigits: 0,
      fixed: false,
      signed: false,
      suffix: '',
    });
  });

  it('fixes the digits a chart sets', () => {
    expect(resolveFormat({ digits: 2 }, undefined, DEFAULTS)).toMatchObject({
      digits: 2,
      minDigits: 2,
      fixed: true,
    });
  });

  it('reads named formats and keeps percent in standard notation', () => {
    expect(resolveFormat('percent', 'ignored', DEFAULTS)).toMatchObject({
      style: 'percent',
      suffix: '%',
      notation: 'standard',
    });
    expect(resolveFormat('currency-delta', undefined, DEFAULTS)).toMatchObject({
      style: 'currency',
      signed: true,
    });
  });

  it('sets symbol units tight and word units after a space', () => {
    expect(resolveFormat(undefined, '%', DEFAULTS).suffix).toBe('%');
    expect(resolveFormat(undefined, 'ms', DEFAULTS).suffix).toBe(' ms');
    expect(resolveFormat(undefined, 'articles', DEFAULTS).suffix).toBe(' articles');
  });
});

describe('formatValue', () => {
  const plain = resolveFormat(undefined, undefined, DEFAULTS);

  it('writes numbers under 10,000 in full and compacts from there', () => {
    expect(formatValue(9310, plain)).toBe('9,310');
    expect(formatValue(18_420, plain)).toBe('18.4K');
    expect(formatValue(4_213_877.12, resolveFormat('currency', undefined, DEFAULTS))).toBe('$4.2M');
  });

  it('writes negatives with the true minus sign and signs deltas', () => {
    expect(formatValue(-3.5, plain)).toBe('−3.5');
    expect(formatValue(12, resolveFormat('delta', undefined, DEFAULTS))).toBe('+12');
    expect(formatValue(0, resolveFormat('delta', undefined, DEFAULTS))).toBe('0');
  });

  it('writes percent values that are already in percent', () => {
    expect(formatValue(34, resolveFormat('percent', undefined, DEFAULTS))).toBe('34%');
  });

  it('writes an em dash for a value that is not a number', () => {
    expect(formatValue(Number.NaN, plain)).toBe('—');
  });

  it('writes exactly the digits a chart sets', () => {
    expect(formatValue(6.1, resolveFormat({ digits: 2 }, undefined, DEFAULTS))).toBe('6.10');
    expect(formatValue(8, resolveFormat({ digits: 1 }, undefined, DEFAULTS))).toBe('8.0');
  });

  it('writes currency in full with cents or none, never one decimal', () => {
    const currency = resolveFormat('currency', undefined, DEFAULTS);
    expect(formatValue(6.1, currency)).toBe('$6.10');
    expect(formatValue(6, currency)).toBe('$6');
    expect(formatValue(1250, currency)).toBe('$1,250');
  });

  it('keeps a significant digit for values under 1', () => {
    expect(formatValue(0.05, plain)).toBe('0.05');
    expect(formatValue(0.5, plain)).toBe('0.5');
    expect(formatValue(0.95, plain)).toBe('0.95');
  });

  it('sets scale units tight and keeps the currency sign with them', () => {
    const millions = resolveFormat('currency-delta', 'M', DEFAULTS);
    expect(formatValue(1.2, { ...millions, signed: false })).toBe('$1.2M');
    expect(formatValue(0.05, millions)).toBe('+$0.05M');
  });
});

describe('itemFormat', () => {
  it('lets an item unit reset the style of the group format', () => {
    expect(itemFormat({ unit: '%' }, { format: 'currency' })).toEqual({ format: {}, unit: '%' });
    expect(itemFormat({ unit: 'M' }, { format: 'currency' })).toEqual({
      format: 'currency',
      unit: 'M',
    });
    expect(itemFormat({ format: 'percent' }, { format: 'currency', unit: 'h' })).toEqual({
      format: 'percent',
      unit: 'h',
    });
    expect(itemFormat({}, { format: 'currency' })).toEqual({ format: 'currency', unit: undefined });
  });
});

describe('runFormatter', () => {
  it('compacts every value of a run when the largest needs it', () => {
    const write = runFormatter([18_420, 9310, 4480], resolveFormat(undefined, undefined, DEFAULTS));
    expect([18_420, 9310, 4480].map(write)).toEqual(['18.4K', '9.3K', '4.5K']);
  });

  it('writes a small run in full', () => {
    const write = runFormatter([310, 560], resolveFormat(undefined, undefined, DEFAULTS));
    expect(write(560)).toBe('560');
  });
});

describe('formatChange', () => {
  const format = resolveFormat(undefined, 'h', DEFAULTS);

  it('writes a relative change as a signed whole percentage, with a decimal under 10%', () => {
    expect(formatChange(7400, 4600, format, true)).toBe('−38%');
    expect(formatChange(100, 105, format, true)).toBe('+5%');
  });

  it('writes an absolute change in the unit', () => {
    expect(formatChange(14, 2.5, format, false)).toBe('−11.5 h');
  });
});

describe('formatChange in points and across zero', () => {
  it('writes the absolute change of values in percent in points', () => {
    const percent = resolveFormat(undefined, '%', DEFAULTS);
    expect(formatChange(84, 91, percent, false)).toBe('+7 pts');
    expect(formatChange(84, 85, percent, false)).toBe('+1 pt');
    expect(defaultRelative(percent)).toBe(false);
    expect(defaultRelative(resolveFormat(undefined, 'h', DEFAULTS))).toBe(true);
  });

  it('writes a change across zero or from near zero in the unit, not as a percentage', () => {
    const plain = resolveFormat(undefined, undefined, DEFAULTS);
    expect(formatChange(0.4, -2.1, plain, true)).toBe('−2.5');
    expect(formatChange(0.01, 5, plain, true)).toBe('+5');
    expect(formatChange(-2, -1, plain, true)).toBe('+50%');
  });
});

describe('tickDigits', () => {
  const format = resolveFormat(undefined, undefined, DEFAULTS);

  it('shows no digits for whole steps and one for tenths', () => {
    expect(tickDigits(2000, 8000, format)).toBe(0);
    expect(tickDigits(0.5, 3, format)).toBe(1);
  });

  it('counts compact steps in the compact unit', () => {
    expect(tickDigits(5000, 20_000, format)).toBe(0);
    expect(tickDigits(2500, 20_000, format)).toBe(1);
  });
});

describe('tickTexts', () => {
  const format = resolveFormat(undefined, undefined, DEFAULTS);

  it('writes enough digits to tell small steps apart', () => {
    expect(tickTexts([0, 0.001, 0.002, 0.003], format)).toEqual(['0', '0.001', '0.002', '0.003']);
    expect(tickTexts([0, 0.0005, 0.001], format)).toEqual(['0', '0.0005', '0.0010']);
  });

  it('drops trailing zeros where every tick is whole in its compact unit', () => {
    expect(tickTexts([0, 500_000, 1_000_000], format)).toEqual(['0', '500K', '1M']);
    expect(
      tickTexts([-1_000_000, -500_000, 0], resolveFormat('currency', undefined, DEFAULTS)),
    ).toEqual(['−$1M', '−$500K', '$0']);
  });

  it('gives every tick in one unit the same digits', () => {
    expect(tickTexts([0, 500_000, 1_000_000, 1_500_000], format)).toEqual([
      '0',
      '500K',
      '1.0M',
      '1.5M',
    ]);
    expect(tickTexts([0, 0.5, 1, 1.5], format)).toEqual(['0', '0.5', '1.0', '1.5']);
  });
});

describe('excelFormat', () => {
  it('writes currency in millions and percent with a quoted sign', () => {
    expect(excelFormat(resolveFormat('currency', undefined, DEFAULTS), 4_100_000)).toBe(
      '$#,##0.0,,"M"',
    );
    expect(excelFormat(resolveFormat('percent', undefined, DEFAULTS), 50)).toBe('#,##0.0"%"');
  });
});

describe('cents above a million', () => {
  it('keeps the cents of a large currency value', () => {
    const standard = resolveFormat(
      { style: 'currency', notation: 'standard' },
      undefined,
      DEFAULTS,
    );
    expect(formatValue(1_000_000.25, standard)).toBe('$1,000,000.25');
    expect(formatValue(1_000_000, standard)).toBe('$1,000,000');
    expect(runFormatter([1_000_000, 2_000_000.5], standard)(1_000_000)).toBe('$1,000,000.00');
  });
});

describe('format names', () => {
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'rejects `%s` as a format, naming the formats',
    (name) => {
      expect(() => resolveFormat(name as never, undefined, DEFAULTS)).toThrow(
        `format="${name}" is not a format`,
      );
    },
  );
});
