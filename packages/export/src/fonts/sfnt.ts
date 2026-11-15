import { inflateSync } from 'node:zlib';

/**
 * The size of an sfnt header: version, table count, search range, entry selector, range shift.
 */
const SFNT_HEADER_SIZE = 12;

/**
 * The size of one sfnt table record: tag, checksum, offset, length.
 */
const TABLE_RECORD_SIZE = 16;

/**
 * The size of a WOFF 1.0 header.
 */
const WOFF_HEADER_SIZE = 44;

/**
 * The size of one WOFF 1.0 table directory entry.
 */
const WOFF_ENTRY_SIZE = 20;

/**
 * The `wOFF` signature of a WOFF 1.0 file.
 */
const WOFF_SIGNATURE = 0x77_4f_46_46;

/**
 * The `wOF2` signature of a WOFF 2.0 file.
 */
const WOFF2_SIGNATURE = 0x77_4f_46_32;

/**
 * The magic number the `head` table's `checkSumAdjustment` is computed against (OpenType `head`).
 */
const CHECKSUM_MAGIC = 0xb1_b0_af_ba;

/**
 * Where `checkSumAdjustment` sits in the `head` table.
 */
const HEAD_CHECKSUM_OFFSET = 8;

/**
 * Widths used by OpenType tags, checksums and aligned table storage.
 */
const TAG_BYTES = 4;

/**
 * The byte width of a checksum word and the alignment of sfnt tables.
 */
const UINT32_BYTES = 4;

/**
 * The number of bits shifted when appending one byte to a checksum word.
 */
const BITS_PER_BYTE = 8;

/**
 * Field offsets within the sfnt header and directory records.
 */
const SFNT_FIELD = {
  /**
   * The number of table directory records.
   */
  tableCount: 4,

  /**
   * The largest power-of-two directory span.
   */
  searchRange: 6,

  /**
   * The base-two logarithm of the search span.
   */
  entrySelector: 8,

  /**
   * The remaining directory span.
   */
  rangeShift: 10,
} as const;

/**
 * Byte offsets within a fixed-width sfnt table directory record.
 */
const TABLE_FIELD = {
  /**
   * The table's checksum.
   */
  checksum: 4,

  /**
   * The table's absolute byte offset.
   */
  offset: 8,

  /**
   * The table's unpadded byte length.
   */
  length: 12,
} as const;

/**
 * Field offsets within a WOFF header and directory entry.
 */
const WOFF_VERSION_OFFSET = 4;

/**
 * The byte offset of the WOFF header's table count.
 */
const WOFF_TABLE_COUNT_OFFSET = 12;

/**
 * Byte offsets within a WOFF table directory entry.
 */
const WOFF_FIELD = {
  /**
   * The compressed bytes' absolute offset.
   */
  offset: 4,

  /**
   * The stored byte length.
   */
  compressedLength: 8,

  /**
   * The original byte length.
   */
  originalLength: 12,
} as const;

/**
 * One table of an sfnt font.
 */
export type SfntTable = {
  /**
   * The four-character tag, such as `glyf`.
   */
  tag: string;

  /**
   * The table's bytes, unpadded.
   */
  data: Uint8Array;
};

/**
 * An sfnt (TrueType or OpenType) font as its tables.
 */
export type Sfnt = {
  /**
   * The sfnt version: `0x00010000` for TrueType outlines, `OTTO` for CFF.
   */
  version: number;

  /**
   * The tables, in file order.
   */
  tables: SfntTable[];
};

/**
 * The container a font file uses, from its first four bytes.
 *
 * @param bytes - The file.
 * @returns `woff2`, `woff` or `sfnt`.
 */
export function fontContainer(bytes: Uint8Array): 'woff2' | 'woff' | 'sfnt' {
  if (bytes.length < TAG_BYTES) {
    return 'sfnt';
  }

  const signature = view(bytes).getUint32(0);
  if (signature === WOFF2_SIGNATURE) {
    return 'woff2';
  }

  return signature === WOFF_SIGNATURE ? 'woff' : 'sfnt';
}

/**
 * Reads the tables of an sfnt font.
 *
 * @param bytes - A TrueType or OpenType file.
 * @returns The font, or a sentence saying why it could not be read.
 */
export function readSfnt(bytes: Uint8Array): Sfnt | string {
  if (bytes.length < SFNT_HEADER_SIZE) {
    return 'the file is too short to be a font';
  }

  const data = view(bytes);
  const count = data.getUint16(SFNT_FIELD.tableCount);
  if (bytes.length < SFNT_HEADER_SIZE + count * TABLE_RECORD_SIZE) {
    return 'the table directory is cut short';
  }

  const tables: SfntTable[] = [];
  for (let index = 0; index < count; index += 1) {
    const record = SFNT_HEADER_SIZE + index * TABLE_RECORD_SIZE;
    const offset = data.getUint32(record + TABLE_FIELD.offset);
    const length = data.getUint32(record + TABLE_FIELD.length);
    if (offset + length > bytes.length) {
      return `table ${tagAt(bytes, record)} runs past the end of the file`;
    }

    tables.push({ tag: tagAt(bytes, record), data: bytes.slice(offset, offset + length) });
  }

  return { version: data.getUint32(0), tables };
}

/**
 * The most bytes one table of a font may inflate to (64 MiB; the largest real fonts' `glyf` tables
 * are a few MiB), so a corrupt or hostile WOFF cannot make the export allocate gigabytes.
 */
const MAX_TABLE_BYTES = 64 * 1024 * 1024;

/**
 * The most bytes all of a font's tables may inflate to (256 MiB).
 */
const MAX_FONT_BYTES = 256 * 1024 * 1024;

/**
 * Unpacks a WOFF 1.0 file into an sfnt font: each table is inflated with zlib when it is
 * compressed. Every offset and length is checked against the file, and the inflated sizes against
 * the sizes the directory declares and a cap, so a corrupt file gives a sentence, never an
 * exception.
 *
 * @param bytes - The WOFF file.
 * @returns The sfnt bytes, or a sentence saying why it could not be read.
 */
export function woffToSfnt(bytes: Uint8Array): Uint8Array | string {
  if (bytes.length < WOFF_HEADER_SIZE) {
    return 'the WOFF file is too short';
  }

  const data = view(bytes);
  const count = data.getUint16(WOFF_TABLE_COUNT_OFFSET);
  if (bytes.length < WOFF_HEADER_SIZE + count * WOFF_ENTRY_SIZE) {
    return 'the WOFF table directory is cut short';
  }

  const tables: SfntTable[] = [];
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    const entry = WOFF_HEADER_SIZE + index * WOFF_ENTRY_SIZE;
    const tag = tagAt(bytes, entry);
    const offset = data.getUint32(entry + WOFF_FIELD.offset);
    const compressed = data.getUint32(entry + WOFF_FIELD.compressedLength);
    const length = data.getUint32(entry + WOFF_FIELD.originalLength);
    if (offset + compressed > bytes.length) {
      return `WOFF table ${tag} runs past the end of the file`;
    }

    if (compressed > length) {
      return `WOFF table ${tag} is stored larger than its original size`;
    }

    total += length;
    if (length > MAX_TABLE_BYTES || total > MAX_FONT_BYTES) {
      return `WOFF table ${tag} is too large (${length} bytes unpacked)`;
    }

    const raw = bytes.slice(offset, offset + compressed);
    if (compressed === length) {
      tables.push({ tag, data: raw });
      continue;
    }

    const inflated = inflateTable(raw, length);
    if (typeof inflated === 'string') {
      return `WOFF table ${tag}: ${inflated}`;
    }

    tables.push({ tag, data: inflated });
  }

  return writeSfnt({ version: data.getUint32(WOFF_VERSION_OFFSET), tables });
}

/**
 * Inflates a zlib stream that must produce exactly the declared number of bytes.
 *
 * @param raw - The compressed bytes.
 * @param length - The size the table declares.
 * @returns The bytes, or a sentence saying why they could not be inflated.
 */
function inflateTable(raw: Uint8Array, length: number): Uint8Array | string {
  try {
    const result = new Uint8Array(inflateSync(raw, { maxOutputLength: Math.max(1, length) }));
    return result.length === length
      ? result
      : `it inflates to ${result.length} bytes, not the ${length} it declares`;
  } catch (cause) {
    return `it does not inflate (${cause instanceof Error ? cause.message : String(cause)})`;
  }
}

/**
 * Writes an sfnt font: tables sorted by tag and padded to four bytes, each table's checksum, and
 * the `head` table's `checkSumAdjustment` for the whole file, as the OpenType specification's
 * "Table directory" and `head` sections define them.
 *
 * @param font - The font.
 * @returns The file.
 */
export function writeSfnt(font: Sfnt): Uint8Array {
  const tables = [...font.tables]
    .map((table) =>
      table.tag === 'head' ? { tag: table.tag, data: zeroAdjustment(table.data) } : table,
    )
    .sort((a, b) => Number(a.tag > b.tag) - Number(a.tag < b.tag));
  const directorySize = SFNT_HEADER_SIZE + tables.length * TABLE_RECORD_SIZE;
  const total = tables.reduce((sum, table) => sum + padded(table.data.length), directorySize);
  const bytes = new Uint8Array(total);
  const data = view(bytes);
  const power = 2 ** Math.floor(Math.log2(Math.max(1, tables.length)));
  data.setUint32(0, font.version);
  data.setUint16(SFNT_FIELD.tableCount, tables.length);
  data.setUint16(SFNT_FIELD.searchRange, power * TABLE_RECORD_SIZE);
  data.setUint16(SFNT_FIELD.entrySelector, Math.log2(power));
  data.setUint16(
    SFNT_FIELD.rangeShift,
    tables.length * TABLE_RECORD_SIZE - power * TABLE_RECORD_SIZE,
  );
  let offset = directorySize;
  let headOffset = -1;
  tables.forEach((table, index) => {
    const record = SFNT_HEADER_SIZE + index * TABLE_RECORD_SIZE;
    for (let character = 0; character < TAG_BYTES; character += 1) {
      data.setUint8(record + character, table.tag.charCodeAt(character));
    }

    data.setUint32(record + TABLE_FIELD.checksum, checksum(table.data));
    data.setUint32(record + TABLE_FIELD.offset, offset);
    data.setUint32(record + TABLE_FIELD.length, table.data.length);
    bytes.set(table.data, offset);
    if (table.tag === 'head') {
      headOffset = offset;
    }

    offset += padded(table.data.length);
  });
  if (headOffset >= 0) {
    const adjustment = (CHECKSUM_MAGIC - checksum(bytes)) >>> 0;
    data.setUint32(headOffset + HEAD_CHECKSUM_OFFSET, adjustment);
  }

  return bytes;
}

/**
 * A table's bytes, or `undefined` when the font has no such table.
 *
 * @param font - The font.
 * @param tag - The table tag.
 */
export function sfntTable(font: Sfnt, tag: string): Uint8Array | undefined {
  return font.tables.find((table) => table.tag === tag)?.data;
}

/**
 * The font with one table replaced or added.
 *
 * @param font - The font.
 * @param tag - The table tag.
 * @param data - The new bytes.
 */
export function withTable(font: Sfnt, tag: string, data: Uint8Array): Sfnt {
  const others = font.tables.filter((table) => table.tag !== tag);
  return { version: font.version, tables: [...others, { tag, data }] };
}

/**
 * The OpenType table checksum: the sum of the data as big-endian 32-bit words, zero-padded.
 *
 * @param data - The table.
 */
export function checksum(data: Uint8Array): number {
  let sum = 0;
  const whole = data.length - (data.length % UINT32_BYTES);
  const words = view(data);
  for (let offset = 0; offset < whole; offset += UINT32_BYTES) {
    sum = (sum + words.getUint32(offset)) >>> 0;
  }

  if (whole < data.length) {
    let last = 0;
    for (let offset = whole; offset < whole + UINT32_BYTES; offset += 1) {
      last = (last << BITS_PER_BYTE) | (data[offset] ?? 0);
    }

    sum = (sum + (last >>> 0)) >>> 0;
  }

  return sum;
}

/**
 * A big-endian view of bytes.
 *
 * @param bytes - The bytes.
 */
export function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/**
 * A `head` table with `checkSumAdjustment` set to zero, as the checksum is computed.
 *
 * @param head - The table.
 */
function zeroAdjustment(head: Uint8Array): Uint8Array {
  const copy = head.slice();
  if (copy.length >= HEAD_CHECKSUM_OFFSET + UINT32_BYTES) {
    view(copy).setUint32(HEAD_CHECKSUM_OFFSET, 0);
  }

  return copy;
}

/**
 * A length rounded up to four bytes.
 *
 * @param length - The length.
 */
function padded(length: number): number {
  return Math.ceil(length / UINT32_BYTES) * UINT32_BYTES;
}

/**
 * The four-character tag at an offset.
 *
 * @param bytes - The file.
 * @param offset - Where the tag starts.
 */
function tagAt(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + TAG_BYTES));
}
