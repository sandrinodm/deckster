import { describe, expect, it } from 'vite-plus/test';

import { cell, parseCsv } from '#charts/data/csv.ts';
import { categorical, fieldKinds, resolveRows, toNumber } from '#charts/data/rows.ts';

describe('parseCsv', () => {
  it('reads a header, numbers, quoted fields and empty cells', () => {
    const rows = parseCsv('team,2025,note\nBilling,18,"slower, again"\n"Access ""A""",16,\n\n');
    expect(rows).toEqual([
      { team: 'Billing', '2025': 18, note: 'slower, again' },
      { team: 'Access "A"', '2025': 16, note: null },
    ]);
  });

  it('reads thousands separators in quoted numbers and CRLF lines', () => {
    expect(parseCsv('a,b\r\n"1,240",x\r\n')).toEqual([{ a: 1240, b: 'x' }]);
  });

  it('fails on a quote that never closes, naming its line', () => {
    expect(() => parseCsv('a\n"open')).toThrow('line 2');
  });

  it('types cells', () => {
    expect(cell(' 3.5 ')).toBe(3.5);
    expect(cell('true')).toBe(true);
    expect(cell('W31')).toBe('W31');
    expect(cell('')).toBeNull();
  });
});

describe('resolveRows', () => {
  const rows = [{ x: 'a', y: 1 }];

  it('passes rows through, looks up a frontmatter dataset and parses CSV text', () => {
    expect(resolveRows(rows, undefined)).toBe(rows);
    expect(resolveRows('teams', { teams: rows })).toBe(rows);
    expect(resolveRows('x,y\na,1', undefined)).toEqual(rows);
  });

  it('names the datasets the slide has when the name is unknown', () => {
    expect(() => resolveRows('team', { teams: rows })).toThrow('It has teams');
    expect(() => resolveRows('team', undefined)).toThrow('no `data:` frontmatter');
  });
});

describe('categorical', () => {
  it('reads wide rows: one series per number field, categories in row order', () => {
    const data = categorical(
      [
        { month: 'Jan', us: 1, eu: 2 },
        { month: 'Feb', us: 3, eu: null },
      ],
      {},
    );
    expect(data.x).toBe('month');
    expect(data.categories).toEqual(['Jan', 'Feb']);
    expect(data.series.map((series) => [series.key, series.values])).toEqual([
      ['us', [1, 3]],
      ['eu', [2, null]],
    ]);
  });

  it('reads long rows split by a series field', () => {
    const data = categorical(
      [
        { month: 'Jan', region: 'US', revenue: 1 },
        { month: 'Jan', region: 'EU', revenue: 2 },
        { month: 'Feb', region: 'US', revenue: 3 },
      ],
      { series: 'region', y: 'revenue' },
    );
    expect(data.series.map((series) => [series.key, series.values])).toEqual([
      ['US', [1, 3]],
      ['EU', [2, null]],
    ]);
  });

  it('keeps a series label and step', () => {
    const data = categorical([{ m: 'a', v: 1 }], { y: [{ field: 'v', label: 'Visits', at: 2 }] });
    expect(data.series[0]).toMatchObject({ key: 'v', label: 'Visits', at: 2 });
  });

  it('names the fields when a field is missing', () => {
    expect(() => categorical([{ a: 'x', b: 1 }], { y: 'c' })).toThrow('Its fields are: a, b');
  });

  it('refuses a category that repeats in wide rows instead of keeping the last', () => {
    expect(() =>
      categorical(
        [
          { month: 'Jan', us: 1 },
          { month: 'Jan', us: 2 },
        ],
        {},
      ),
    ).toThrow('Two rows have month="Jan"');
  });

  it('refuses a series and category pair that repeats in long rows', () => {
    expect(() =>
      categorical(
        [
          { month: 'Jan', region: 'US', revenue: 1 },
          { month: 'Jan', region: 'US', revenue: 2 },
        ],
        { series: 'region', y: 'revenue' },
      ),
    ).toThrow('Two rows have region="US" and month="Jan"');
  });
});

describe('fieldKinds and toNumber', () => {
  it('tells text fields from number fields', () => {
    expect(fieldKinds([{ a: 'x', b: 1, c: '2' }])).toEqual({ text: ['a'], numbers: ['b', 'c'] });
    expect(toNumber('1,240')).toBe(1240);
    expect(toNumber('n/a')).toBeNull();
  });
});

describe('fields named like properties of every object', () => {
  const rows = [{ team: 'Billing', tickets: 4 }];

  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'does not find a field `%s` that the rows do not have',
    (name) => {
      expect(() => categorical(rows, { x: name, y: 'tickets' })).toThrow(
        `x="${name}" is not a field of the data`,
      );
      expect(() => categorical(rows, { x: 'team', y: name })).toThrow(
        `y="${name}" is not a field of the data`,
      );
    },
  );
});
