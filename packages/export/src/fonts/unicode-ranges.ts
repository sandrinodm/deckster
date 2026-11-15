/**
 * An inclusive range of code points.
 */
export type CodePointRange = readonly [number, number];

/**
 * Characters every embedded instance keeps beyond the deck's text, so a recipient can edit in the
 * font: Basic Latin, Latin-1 Supplement and the punctuation, currency and arrows people type.
 */
export const EDITING_RANGES: readonly CodePointRange[] = [
  [0x20, 0x7e],
  [0xa0, 0xff],
  [0x131, 0x131],
  [0x152, 0x153],
  [0x2c6, 0x2c6],
  [0x2da, 0x2da],
  [0x2dc, 0x2dc],
  [0x2013, 0x2014],
  [0x2018, 0x201a],
  [0x201c, 0x201e],
  [0x2020, 0x2022],
  [0x2026, 0x2026],
  [0x2030, 0x2030],
  [0x2039, 0x203a],
  [0x2044, 0x2044],
  [0x20ac, 0x20ac],
  [0x2122, 0x2122],
  [0x2190, 0x2193],
  [0x2212, 0x2212],
];

/**
 * The code points of the Fontsource subsets a brand may declare, added to the editing set.
 */
export const SUBSET_RANGES: Readonly<Record<string, readonly CodePointRange[]>> = {
  /**
   * Latin.
   */
  latin: [[0x20, 0xff]],

  /**
   * Latin Extended-A and -B and Latin Extended Additional.
   */
  'latin-ext': [
    [0x100, 0x24f],
    [0x1e00, 0x1eff],
  ],

  /**
   * Greek.
   */
  greek: [[0x370, 0x3ff]],

  /**
   * Cyrillic.
   */
  cyrillic: [[0x400, 0x4ff]],

  /**
   * Vietnamese.
   */
  vietnamese: [
    [0x102, 0x103],
    [0x110, 0x111],
    [0x1a0, 0x1b0],
    [0x1ea0, 0x1ef9],
    [0x20ab, 0x20ab],
  ],
};

/**
 * One part of a CSS `unicode-range`: `U+` and up to six hex digits or question marks, with an
 * optional `-` end. Its capture groups are the start and the end.
 */
const UNICODE_RANGE_PART = /^\s*U\+([0-9A-F?]{1,6})(?:-([0-9A-F]{1,6}))?\s*$/i;

/**
 * Parses a CSS `unicode-range` such as `U+0000-00FF, U+0131, U+02??`.
 *
 * @param text - The descriptor's value.
 * @returns The ranges; unparseable parts are skipped.
 */
export function parseUnicodeRange(text: string): CodePointRange[] {
  return text.split(',').flatMap((part): CodePointRange[] => {
    const match = UNICODE_RANGE_PART.exec(part);
    if (match === null) {
      return [];
    }

    const [, start = '', end] = match;
    if (start.includes('?')) {
      return [
        [
          Number.parseInt(start.replaceAll('?', '0'), 16),
          Number.parseInt(start.replaceAll('?', 'F'), 16),
        ],
      ];
    }

    const first = Number.parseInt(start, 16);
    return [[first, end === undefined ? first : Number.parseInt(end, 16)]];
  });
}

/**
 * Whether a code point is in one of the ranges.
 *
 * @param ranges - The ranges.
 * @param codePoint - The code point.
 */
export function inRanges(ranges: readonly CodePointRange[], codePoint: number): boolean {
  return ranges.some(([first, last]) => codePoint >= first && codePoint <= last);
}

/**
 * Every code point of some ranges.
 *
 * @param ranges - The ranges.
 */
export function rangeCodePoints(ranges: readonly CodePointRange[]): number[] {
  return ranges.flatMap(([first, last]) =>
    Array.from({ length: last - first + 1 }, (_, index) => first + index),
  );
}
