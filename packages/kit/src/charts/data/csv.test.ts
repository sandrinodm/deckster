import { describe, expect, it } from 'vite-plus/test';

import { cell, parseCsv } from '#charts/data/csv.ts';

describe('parseCsv', () => {
  it('skips blank lines and keeps empty fields as null', () => {
    expect(parseCsv('a,b,c\n1,2,\n\n,,\n3,,x')).toEqual([
      { a: 1, b: 2, c: null },
      { a: 3, b: null, c: 'x' },
    ]);
  });

  it('rejects a duplicate header, also after trimming', () => {
    expect(() => parseCsv('name,revenue,revenue\nA,10,999')).toThrow(/"revenue".*twice/u);
    expect(() => parseCsv('name, revenue ,revenue\nA,10,999')).toThrow(/"revenue"/u);
  });

  it('reports a ragged line with its number', () => {
    expect(() => parseCsv('a,b\n1,2\n3\n')).toThrow(/line 3.*1 field.*2/u);
    expect(() => parseCsv('a,b\n1,2,3')).toThrow(/line 2.*3 fields.*2/u);
  });

  it('counts CRLF as one line', () => {
    expect(() => parseCsv('a,b\r\n1,2\r\n3\r\n')).toThrow(/line 3/u);
    expect(() => parseCsv('a\r\n"x\r\ny\r\nz\r\n')).toThrow(/line 2/u);
    expect(() => parseCsv('a,b\r\n"x\r\ny",2\r\n3\r\n')).toThrow(/line 4/u);
  });

  it('ignores a byte order mark', () => {
    expect(parseCsv('\uFEFFname,n\nA,1')).toEqual([{ name: 'A', n: 1 }]);
  });

  it('keeps line breaks and doubled quotes inside a quoted field', () => {
    expect(parseCsv('note,n\n"two\nlines, ""quoted""",4')).toEqual([
      { note: 'two\nlines, "quoted"', n: 4 },
    ]);
  });

  it('trims the header and reads booleans', () => {
    expect(parseCsv(' team , live\nA,true\nB,false')).toEqual([
      { team: 'A', live: true },
      { team: 'B', live: false },
    ]);
  });

  it('returns no rows for a header alone or no text', () => {
    expect(parseCsv('a,b\n')).toEqual([]);
    expect(parseCsv('')).toEqual([]);
  });
});

describe('cell', () => {
  it('keeps a field with a leading zero as text', () => {
    expect(cell('007')).toBe('007');
    expect(cell('0123')).toBe('0123');
    expect(cell('-007')).toBe('-007');
    expect(cell('0')).toBe(0);
    expect(cell('0.5')).toBe(0.5);
  });

  it('reads signs, fractions, exponents and thousands separators as numbers', () => {
    expect(cell('-3.5')).toBe(-3.5);
    expect(cell('+12')).toBe(12);
    expect(cell('1.2e3')).toBe(1200);
    expect(cell('1,240,000')).toBe(1_240_000);
    expect(cell('.5')).toBe(0.5);
  });

  it('keeps text that only looks numeric as text', () => {
    expect(cell('12,34')).toBe('12,34');
    expect(cell('31%')).toBe('31%');
    expect(cell('-')).toBe('-');
    expect(cell(undefined)).toBeNull();
  });
});
