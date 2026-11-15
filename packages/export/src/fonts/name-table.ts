import { view } from '#fonts/sfnt.ts';

/**
 * Windows platform, Unicode BMP encoding, US English: the records Office and every modern system
 * read.
 */
const WINDOWS = {
  /**
   * Platform 3, Windows.
   */
  platform: 3,

  /**
   * Encoding 1, Unicode BMP.
   */
  encoding: 1,

  /**
   * Language 0x0409, English (United States).
   */
  language: 0x04_09,
} as const;

/**
 * The size of the `name` table header (format 0).
 */
const HEADER_SIZE = 6;

/**
 * The size of one name record.
 */
const RECORD_SIZE = 12;

/**
 * Byte offsets within the name table header and its fixed-width records.
 */
const STRING_STORAGE_OFFSET = 4;

/**
 * Byte offsets of the fields inside one fixed-width name record.
 */
const RECORD_FIELD = {
  /**
   * The record's Windows language identifier.
   */
  language: 4,

  /**
   * The kind of name, such as family or subfamily.
   */
  nameId: 6,

  /**
   * The encoded string's byte length.
   */
  byteLength: 8,

  /**
   * The string's offset relative to the storage area.
   */
  stringOffset: 10,
} as const;

/**
 * Name ids the OpenType `name` table defines that instances rewrite.
 */
export const NAME_ID = {
  /**
   * Copyright notice.
   */
  copyright: 0,

  /**
   * Family name, as Windows style-links four faces under it.
   */
  family: 1,

  /**
   * Subfamily: Regular, Bold, Italic or Bold Italic.
   */
  subfamily: 2,

  /**
   * Unique identifier.
   */
  unique: 3,

  /**
   * Full name.
   */
  full: 4,

  /**
   * Version string.
   */
  version: 5,

  /**
   * PostScript name.
   */
  postscript: 6,

  /**
   * Typographic family name.
   */
  typographicFamily: 16,

  /**
   * Typographic subfamily name.
   */
  typographicSubfamily: 17,
} as const;

/**
 * Name ids copied from the source font to an instance: copyright, version, trademark, manufacturer,
 * designer, description, vendor and designer URLs, license and license URL.
 */
export const KEPT_NAME_IDS: readonly number[] = [0, 5, 7, 8, 9, 10, 11, 12, 13, 14];

/**
 * One name string.
 */
export type NameRecord = {
  /**
   * The name id.
   */
  nameId: number;

  /**
   * The string.
   */
  value: string;
};

/**
 * Reads the English (or else the first) Unicode string of each name id from a `name` table.
 *
 * @param table - The table.
 * @returns One record per name id, in id order.
 */
export function readNames(table: Uint8Array): NameRecord[] {
  if (table.length < HEADER_SIZE) {
    return [];
  }

  const data = view(table);
  const count = data.getUint16(2);
  const storage = data.getUint16(STRING_STORAGE_OFFSET);
  const found = new Map<number, { value: string; english: boolean }>();
  for (let index = 0; index < count; index += 1) {
    const record = HEADER_SIZE + index * RECORD_SIZE;
    if (record + RECORD_SIZE > table.length) {
      break;
    }

    const platform = data.getUint16(record);
    const language = data.getUint16(record + RECORD_FIELD.language);
    const nameId = data.getUint16(record + RECORD_FIELD.nameId);
    const length = data.getUint16(record + RECORD_FIELD.byteLength);
    const offset = storage + data.getUint16(record + RECORD_FIELD.stringOffset);
    const unicode = platform === 0 || platform === WINDOWS.platform;
    if (!unicode || offset + length > table.length) {
      continue;
    }

    const english = platform === WINDOWS.platform && language === WINDOWS.language;
    const previous = found.get(nameId);
    if (previous === undefined || (english && !previous.english)) {
      found.set(nameId, { value: utf16be(table.slice(offset, offset + length)), english });
    }
  }

  return [...found.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([nameId, entry]) => ({ nameId, value: entry.value }));
}

/**
 * Writes a format 0 `name` table with one Windows English Unicode record per name.
 *
 * @param names - The names; at most one per id.
 * @returns The table.
 */
export function writeNames(names: readonly NameRecord[]): Uint8Array {
  const sorted = [...names].sort((a, b) => a.nameId - b.nameId);
  const strings = sorted.map((name) => encodeUtf16be(name.value));
  const storage = HEADER_SIZE + sorted.length * RECORD_SIZE;
  const total = strings.reduce((sum, bytes) => sum + bytes.length, storage);
  const table = new Uint8Array(total);
  const data = view(table);
  data.setUint16(0, 0);
  data.setUint16(2, sorted.length);
  data.setUint16(STRING_STORAGE_OFFSET, storage);
  let offset = 0;
  sorted.forEach((name, index) => {
    const record = HEADER_SIZE + index * RECORD_SIZE;
    const bytes = strings[index] ?? new Uint8Array();
    data.setUint16(record, WINDOWS.platform);
    data.setUint16(record + 2, WINDOWS.encoding);
    data.setUint16(record + RECORD_FIELD.language, WINDOWS.language);
    data.setUint16(record + RECORD_FIELD.nameId, name.nameId);
    data.setUint16(record + RECORD_FIELD.byteLength, bytes.length);
    data.setUint16(record + RECORD_FIELD.stringOffset, offset);
    table.set(bytes, storage + offset);
    offset += bytes.length;
  });
  return table;
}

/**
 * Decodes UTF-16BE bytes.
 *
 * @param bytes - The bytes.
 */
function utf16be(bytes: Uint8Array): string {
  const data = view(bytes);
  let text = '';
  for (let offset = 0; offset + 1 < bytes.length; offset += 2) {
    text += String.fromCharCode(data.getUint16(offset));
  }

  return text;
}

/**
 * Encodes text as UTF-16BE.
 *
 * @param text - The text.
 */
function encodeUtf16be(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length * 2);
  const data = view(bytes);
  for (let index = 0; index < text.length; index += 1) {
    data.setUint16(index * 2, text.charCodeAt(index));
  }

  return bytes;
}
