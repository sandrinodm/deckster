import { NAME_ID, readNames } from '#fonts/name-table.ts';
import { readSfnt, sfntTable, view } from '#fonts/sfnt.ts';

/**
 * The content type of an embedded font part in a presentation package, as PowerPoint writes it
 * (`ppt/fonts/fontN.fntdata`).
 */
export const FONT_DATA_CONTENT_TYPE = 'application/x-fontdata';

/**
 * The extension of embedded font parts.
 */
export const FONT_DATA_EXTENSION = 'fntdata';

/**
 * The relationship type from `presentation.xml` to an embedded font part (ECMA-376 Part 1, §15.2.13
 * "Font Part").
 */
export const FONT_RELATIONSHIP =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/font';

/**
 * EOT version 0x00020002, the last one, which adds the root string checksum and EUDC fields.
 */
const EOT_VERSION = 0x00_02_00_02;

/**
 * The EOT magic number.
 */
export const EOT_MAGIC = 0x50_4c;

/**
 * `TTEMBED_SUBSET`: the font data holds a subset of the font's glyphs. No other flag is set: the
 * data is not MicroType Express compressed (`TTEMBED_TTCOMPRESSED`) and not XOR-encrypted
 * (`TTEMBED_XORENCRYPTDATA`).
 */
const TTEMBED_SUBSET = 0x00_00_00_01;

/**
 * `DEFAULT_CHARSET`, which the EOT format says the `Charset` field should hold.
 */
const DEFAULT_CHARSET = 0x01;

/**
 * The XOR key of the root string checksum; an empty root string's checksum is this value.
 */
const ROOT_STRING_CHECKSUM_KEY = 0x50_47_53_42;

/**
 * The size of the fixed part of the header, up to and including the four reserved fields.
 */
const FIXED_HEADER_SIZE = 80;

/**
 * The bytes after the names and before the font data: Padding5 and RootStringSize, the empty root
 * string's checksum, EUDCCodePage, Padding6, SignatureSize, EUDCFlags and EUDCFontSize. 24 in all.
 */
const VARIABLE_TAIL_SIZE = 24;

/**
 * The Windows-1252 code page, the EUDC code page LibreOffice writes.
 */
const WINDOWS_1252_CODE_PAGE = 1252;

/**
 * Byte widths of the little-endian integer fields in an EOT header.
 */
const WORD_BYTES = 2;

/**
 * The byte width of a 32-bit EOT field.
 */
const DWORD_BYTES = 4;

/**
 * Counts fixed by the EOT and OpenType header formats.
 */
const NAME_FIELD_COUNT = 4;

/**
 * The four Unicode range bitfields copied from OS/2.
 */
const UNICODE_RANGE_COUNT = 4;

/**
 * The byte width of the PANOSE classification.
 */
const PANOSE_BYTES = 10;

/**
 * The byte offset of head.checkSumAdjustment in the source font.
 */
const HEAD_CHECKSUM_OFFSET = 8;

/**
 * The radix used to report binary font fields as hexadecimal.
 */
const HEX_RADIX = 16;

/**
 * The number of hexadecimal digits representing one byte.
 */
const HEX_BYTE_DIGITS = 2;

/**
 * Byte offsets of the fixed EOT fields shared by the reader and writer.
 */
const EOT_FIELD = {
  /**
   * The embedded font's byte length.
   */
  fontDataSize: 4,

  /**
   * The EOT format version.
   */
  version: 8,

  /**
   * Font processing flags.
   */
  flags: 12,

  /**
   * The ten PANOSE classification bytes.
   */
  panose: 16,

  /**
   * The Windows character set.
   */
  charset: 26,

  /**
   * The italic style flag.
   */
  italic: 27,

  /**
   * The font weight class.
   */
  weight: 28,

  /**
   * Font embedding permissions.
   */
  fsType: 32,

  /**
   * The EOT signature.
   */
  magic: 34,

  /**
   * Four Unicode range bitfields.
   */
  unicodeRange: 36,

  /**
   * Two code page range bitfields.
   */
  codePageRange: 52,

  /**
   * The source font's checksum adjustment.
   */
  checksumAdjustment: 60,
} as const;

/**
 * Offsets into the OS/2 table that the EOT header copies.
 */
const OS2 = {
  /**
   * `usWeightClass`.
   */
  weightClass: 4,

  /**
   * `fsType`.
   */
  fsType: 8,

  /**
   * The PANOSE bytes.
   */
  panose: 32,

  /**
   * `ulUnicodeRange1` to `4`.
   */
  unicodeRange: 42,

  /**
   * `fsSelection`.
   */
  fsSelection: 62,

  /**
   * `ulCodePageRange1` and `2` (OS/2 version 1 and later).
   */
  codePageRange: 78,
} as const;

/**
 * The fields of an EOT header this module writes, as read back.
 */
export type EotHeader = {
  /**
   * The size of the whole file.
   */
  eotSize: number;

  /**
   * The size of the font data after the header.
   */
  fontDataSize: number;

  /**
   * The format version.
   */
  version: number;

  /**
   * The processing flags.
   */
  flags: number;

  /**
   * The PANOSE bytes as hex.
   */
  panose: string;

  /**
   * Whether the font is italic.
   */
  italic: boolean;

  /**
   * The weight class.
   */
  weight: number;

  /**
   * The embedding permissions.
   */
  fsType: number;

  /**
   * The magic number, {@link EOT_MAGIC}.
   */
  magic: number;

  /**
   * The family name.
   */
  familyName: string;

  /**
   * The style name.
   */
  styleName: string;

  /**
   * The version name.
   */
  versionName: string;

  /**
   * The full name.
   */
  fullName: string;

  /**
   * Where the font data starts.
   */
  fontDataOffset: number;
};

/**
 * The bytes of an embedded font part (`ppt/fonts/fontN.fntdata`) for a TrueType font.
 *
 * PresentationML embeds fonts through `p:embeddedFontLst` (ECMA-376 Part 1, §19.2.1.10), each
 * `p:embeddedFont` (§19.2.1.9) naming the typeface in `p:font` (§19.2.1.13) and pointing at up to
 * four font parts (§15.2.13) with `p:regular`, `p:bold`, `p:italic` and `p:boldItalic`. ECMA-376
 * leaves the part's format to the application; PowerPoint (2007 and later) writes and reads
 * Embedded OpenType, content type `application/x-fontdata`, extension `.fntdata`. That is also how
 * LibreOffice reads these parts (`oox/source/ppt/EmbeddedFontListContext.cxx` passes every one to
 * `EmbeddedFontsManager::addEmbeddedFont` with `eot = true`) and writes them
 * (`sd/source/filter/eppt/pptx-epptooxml.cxx`, `font::EOTConverter`). WordprocessingML's GUID-XOR
 * obfuscation (§17.8.1, `.odttf`) does not apply to presentations.
 *
 * The header follows the Embedded OpenType File Format (W3C Member Submission, 2008), version
 * 0x00020002, little-endian: sizes, flags (`TTEMBED_SUBSET` only: no MicroType Express compression,
 * no XOR), the font's OS/2 PANOSE, italic bit, weight class, `fsType`, Unicode and code page ranges
 * and `head.checkSumAdjustment`, the magic number 0x504C, then the family, style, version and full
 * names from the `name` table as UTF-16LE with their byte sizes (no terminator), an empty root
 * string with its checksum, no signature and no EUDC font, then the TrueType font itself.
 *
 * @param font - A TrueType font with OS/2, `head` and `name` tables.
 * @returns The EOT file.
 */
export function fntdata(font: Uint8Array): Uint8Array {
  const parsed = readSfnt(font);
  const os2 = typeof parsed === 'string' ? undefined : sfntTable(parsed, 'OS/2');
  const head = typeof parsed === 'string' ? undefined : sfntTable(parsed, 'head');
  const nameTable = typeof parsed === 'string' ? undefined : sfntTable(parsed, 'name');
  const names = nameTable === undefined ? [] : readNames(nameTable);
  /**
   * A name record's text, or an empty string.
   */
  const name = (id: number): string => names.find((record) => record.nameId === id)?.value ?? '';
  const strings = [
    name(NAME_ID.family),
    name(NAME_ID.subfamily),
    name(NAME_ID.version),
    name(NAME_ID.full),
  ].map(utf16le);
  const variableSize =
    strings.reduce((sum, bytes) => sum + DWORD_BYTES + bytes.length, 0) + VARIABLE_TAIL_SIZE;
  const headerSize = FIXED_HEADER_SIZE + variableSize;
  const bytes = new Uint8Array(headerSize + font.length);
  writeFixedHeader(bytes, font, os2, head);
  const fontOffset = writeVariableHeader(bytes, strings);
  bytes.set(font, fontOffset);
  return bytes;
}

/**
 * Writes the fixed part of the header: the sizes, flags, the OS/2 copies, the charset, the magic
 * number and the font's checksum adjustment.
 *
 * @param bytes - The file, sized for the whole header and the font.
 * @param font - The TrueType font.
 * @param os2 - The font's OS/2 table, if it has one.
 * @param head - The font's `head` table, if it has one.
 */
function writeFixedHeader(
  bytes: Uint8Array,
  font: Uint8Array,
  os2: Uint8Array | undefined,
  head: Uint8Array | undefined,
): void {
  const data = view(bytes);
  data.setUint32(0, bytes.length, true);
  data.setUint32(EOT_FIELD.fontDataSize, font.length, true);
  data.setUint32(EOT_FIELD.version, EOT_VERSION, true);
  data.setUint32(EOT_FIELD.flags, TTEMBED_SUBSET, true);
  writeOs2Fields(bytes, os2);
  data.setUint8(EOT_FIELD.charset, DEFAULT_CHARSET);
  data.setUint16(EOT_FIELD.magic, EOT_MAGIC, true);
  if (head !== undefined && head.length >= HEAD_CHECKSUM_OFFSET + DWORD_BYTES) {
    data.setUint32(EOT_FIELD.checksumAdjustment, view(head).getUint32(HEAD_CHECKSUM_OFFSET), true);
  }
}

/**
 * Copies the OS/2 fields the header carries: PANOSE, the italic bit, the weight class, `fsType`,
 * the Unicode ranges and, in OS/2 version 1 and later, the code page ranges. Without a usable OS/2
 * table the fields stay zero.
 *
 * @param bytes - The file.
 * @param os2 - The font's OS/2 table, if it has one.
 */
function writeOs2Fields(bytes: Uint8Array, os2: Uint8Array | undefined): void {
  if (os2 === undefined || os2.length < OS2.fsSelection + WORD_BYTES) {
    return;
  }

  const data = view(bytes);
  const source = view(os2);
  bytes.set(os2.slice(OS2.panose, OS2.panose + PANOSE_BYTES), EOT_FIELD.panose);
  data.setUint8(EOT_FIELD.italic, source.getUint16(OS2.fsSelection) & 0x01);
  data.setUint32(EOT_FIELD.weight, source.getUint16(OS2.weightClass), true);
  data.setUint16(EOT_FIELD.fsType, source.getUint16(OS2.fsType), true);
  for (let index = 0; index < UNICODE_RANGE_COUNT; index += 1) {
    data.setUint32(
      EOT_FIELD.unicodeRange + index * DWORD_BYTES,
      source.getUint32(OS2.unicodeRange + index * DWORD_BYTES),
      true,
    );
  }

  if (os2.length >= OS2.codePageRange + DWORD_BYTES * 2) {
    data.setUint32(EOT_FIELD.codePageRange, source.getUint32(OS2.codePageRange), true);
    data.setUint32(
      EOT_FIELD.codePageRange + DWORD_BYTES,
      source.getUint32(OS2.codePageRange + DWORD_BYTES),
      true,
    );
  }
}

/**
 * Writes the four length-prefixed names, then the empty root string, the EUDC fields and the
 * padding that follow them.
 *
 * @param bytes - The file.
 * @param strings - The family, style, version and full names as UTF-16LE.
 * @returns Where the font data starts.
 */
function writeVariableHeader(bytes: Uint8Array, strings: readonly Uint8Array[]): number {
  const data = view(bytes);
  let offset = FIXED_HEADER_SIZE;
  for (const text of strings) {
    data.setUint16(offset, 0, true);
    data.setUint16(offset + WORD_BYTES, text.length, true);
    bytes.set(text, offset + DWORD_BYTES);
    offset += DWORD_BYTES + text.length;
  }

  // Padding5 and an empty root string.
  offset += DWORD_BYTES;
  data.setUint32(offset, ROOT_STRING_CHECKSUM_KEY, true);
  // EUDCCodePage: Windows-1252, as LibreOffice writes it; read only with an EUDC font.
  data.setUint32(offset + DWORD_BYTES, WINDOWS_1252_CODE_PAGE, true);
  // Padding6, SignatureSize 0, EUDCFlags 0, EUDCFontSize 0: the bytes stay zero.
  return offset + DWORD_BYTES * 4 + WORD_BYTES * 2;
}

/**
 * Reads back the header of an EOT file, for tests and checks.
 *
 * @param bytes - The file.
 * @returns The header, or a sentence saying why it is not an EOT file.
 */
export function readEotHeader(bytes: Uint8Array): EotHeader | string {
  if (bytes.length < FIXED_HEADER_SIZE + WORD_BYTES) {
    return 'too short for an EOT header';
  }

  const data = view(bytes);
  const magic = data.getUint16(EOT_FIELD.magic, true);
  if (magic !== EOT_MAGIC) {
    return `the magic number is 0x${magic.toString(16)}, not 0x504c`;
  }

  const strings: string[] = [];
  let offset = FIXED_HEADER_SIZE;
  for (let index = 0; index < NAME_FIELD_COUNT; index += 1) {
    const size = data.getUint16(offset + WORD_BYTES, true);
    strings.push(fromUtf16le(bytes.slice(offset + DWORD_BYTES, offset + DWORD_BYTES + size)));
    offset += DWORD_BYTES + size;
  }

  const rootSize = data.getUint16(offset + WORD_BYTES, true);
  offset += DWORD_BYTES + rootSize + DWORD_BYTES * 2;
  const signatureSize = data.getUint16(offset + WORD_BYTES, true);
  offset += DWORD_BYTES + signatureSize;
  const eudcSize = data.getUint32(offset + DWORD_BYTES, true);
  offset += DWORD_BYTES * 2 + eudcSize;
  return {
    eotSize: data.getUint32(0, true),
    fontDataSize: data.getUint32(EOT_FIELD.fontDataSize, true),
    version: data.getUint32(EOT_FIELD.version, true),
    flags: data.getUint32(EOT_FIELD.flags, true),
    panose: Array.from(bytes.subarray(EOT_FIELD.panose, EOT_FIELD.panose + PANOSE_BYTES), (byte) =>
      byte.toString(HEX_RADIX).padStart(HEX_BYTE_DIGITS, '0'),
    )
      .join('')
      .toUpperCase(),
    italic: data.getUint8(EOT_FIELD.italic) === 1,
    weight: data.getUint32(EOT_FIELD.weight, true),
    fsType: data.getUint16(EOT_FIELD.fsType, true),
    magic,
    familyName: strings[0] ?? '',
    styleName: strings[1] ?? '',
    versionName: strings[2] ?? '',
    fullName: strings[3] ?? '',
    fontDataOffset: offset,
  };
}

/**
 * Encodes text as UTF-16LE.
 *
 * @param text - The text.
 */
function utf16le(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length * 2);
  const data = view(bytes);
  for (let index = 0; index < text.length; index += 1) {
    data.setUint16(index * 2, text.charCodeAt(index), true);
  }

  return bytes;
}

/**
 * Decodes UTF-16LE bytes.
 *
 * @param bytes - The bytes.
 */
function fromUtf16le(bytes: Uint8Array): string {
  const data = view(bytes);
  let text = '';
  for (let offset = 0; offset + 1 < bytes.length; offset += 2) {
    text += String.fromCharCode(data.getUint16(offset, true));
  }

  return text;
}
