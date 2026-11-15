import { describe, expect, it } from 'vite-plus/test';

import { NAME_ID, readNames, writeNames } from '#fonts/name-table.ts';
import { checksum, readSfnt, sfntTable, view, writeSfnt, type Sfnt } from '#fonts/sfnt.ts';

/**
 * A font with a `head` table and an odd-length table.
 */
const FONT: Sfnt = {
  version: 0x00_01_00_00,
  tables: [
    { tag: 'name', data: writeNames([{ nameId: NAME_ID.family, value: 'Inter Deck Body' }]) },
    { tag: 'head', data: new Uint8Array(54) },
    { tag: 'abcd', data: new Uint8Array([1, 2, 3]) },
  ],
};

describe('writeSfnt', () => {
  it('sorts and pads tables, and sets checkSumAdjustment so the file sums to the magic', () => {
    const bytes = writeSfnt(FONT);
    const parsed = readSfnt(bytes);
    expect(typeof parsed).not.toBe('string');
    const tables = typeof parsed === 'string' ? [] : parsed.tables;
    expect(tables.map((table) => table.tag)).toEqual(['abcd', 'head', 'name']);
    expect(sfntTable(typeof parsed === 'string' ? FONT : parsed, 'abcd')).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    const head = tables.find((table) => table.tag === 'head')?.data ?? new Uint8Array();
    const adjustment = view(head).getUint32(8);
    const zeroed = bytes.slice();
    const headOffset = view(bytes).getUint32(12 + 16 + 8);
    view(zeroed).setUint32(headOffset + 8, 0);
    expect((checksum(zeroed) + adjustment) >>> 0).toBe(0xb1_b0_af_ba);
  });
});

describe('name table', () => {
  it('reads back what it writes, one Windows English record per id', () => {
    const table = writeNames([
      { nameId: NAME_ID.subfamily, value: 'Bold' },
      { nameId: NAME_ID.family, value: 'Bricolage Deck Headline' },
    ]);
    expect(readNames(table)).toEqual([
      { nameId: NAME_ID.family, value: 'Bricolage Deck Headline' },
      { nameId: NAME_ID.subfamily, value: 'Bold' },
    ]);
  });
});
