import { KEPT_NAME_IDS, NAME_ID, readNames, writeNames } from '#fonts/name-table.ts';
import { readSfnt, sfntTable, view, withTable, writeSfnt, type Sfnt } from '#fonts/sfnt.ts';

/**
 * Characters that cannot appear in the generated ASCII PostScript family and subfamily names.
 */
const UNSAFE_POSTSCRIPT_NAME_PATTERN = /[^A-Za-z0-9]/g;

/**
 * The four faces PowerPoint (and Windows style linking) keeps under one family name.
 */
export type FontSlot = 'regular' | 'bold' | 'italic' | 'boldItalic';

/**
 * Every {@link FontSlot}, in the order `p:embeddedFont` lists them.
 */
export const FONT_SLOTS: readonly FontSlot[] = ['regular', 'bold', 'italic', 'boldItalic'];

/**
 * The OS/2 and `head` facts of a slot: subfamily name, weight class, `fsSelection` and `macStyle`
 * bits.
 */
const SLOT_FACTS: Readonly<
  Record<FontSlot, { subfamily: string; weight: number; selection: number; macStyle: number }>
> = {
  /**
   * Regular: weight 400, `fsSelection` REGULAR (bit 6).
   */
  regular: { subfamily: 'Regular', weight: 400, selection: 0x40, macStyle: 0 },

  /**
   * Bold: weight 700, `fsSelection` BOLD (bit 5), `macStyle` bold (bit 0).
   */
  bold: { subfamily: 'Bold', weight: 700, selection: 0x20, macStyle: 0x01 },

  /**
   * Italic: weight 400, `fsSelection` ITALIC (bit 0), `macStyle` italic (bit 1).
   */
  italic: { subfamily: 'Italic', weight: 400, selection: 0x01, macStyle: 0x02 },

  /**
   * Bold italic: weight 700, `fsSelection` ITALIC and BOLD, `macStyle` bold and italic.
   */
  boldItalic: { subfamily: 'Bold Italic', weight: 700, selection: 0x21, macStyle: 0x03 },
};

/**
 * The subfamily name of a slot, as the `name` table and file names spell it.
 *
 * @param slot - The face.
 */
export function subfamilyOf(slot: FontSlot): string {
  return SLOT_FACTS[slot].subfamily;
}

/**
 * The `fsSelection` bits a slot sets: ITALIC (0), BOLD (5), REGULAR (6) and OBLIQUE (9).
 */
const STYLE_SELECTION_BITS = 0x02_61;

/**
 * Offsets into the OS/2 table (OpenType `OS/2`, any version).
 */
export const OS2 = {
  /**
   * `usWeightClass`.
   */
  weightClass: 4,

  /**
   * `usWidthClass`.
   */
  widthClass: 6,

  /**
   * `fsType`, the embedding permissions.
   */
  fsType: 8,

  /**
   * The ten PANOSE bytes.
   */
  panose: 32,

  /**
   * `fsSelection`.
   */
  fsSelection: 62,

  /**
   * `sTypoAscender`.
   */
  typoAscender: 68,

  /**
   * `sTypoDescender` (negative below the baseline).
   */
  typoDescender: 70,

  /**
   * `usWinAscent`.
   */
  winAscent: 74,

  /**
   * `usWinDescent` (positive below the baseline).
   */
  winDescent: 76,
} as const;

/**
 * The `fsSelection` bit USE_TYPO_METRICS: browsers then lay lines out with the typographic metrics.
 */
const USE_TYPO_METRICS = 0x80;

/**
 * Where `ascender` and `descender` sit in the `hhea` table.
 */
const HHEA = {
  /**
   * `ascender`.
   */
  ascender: 4,

  /**
   * `descender` (negative below the baseline).
   */
  descender: 6,
} as const;

/**
 * `usWidthClass` 5, medium (normal): every face of a family gets it, so apps link them.
 */
const NORMAL_WIDTH_CLASS = 5;

/**
 * Where `macStyle` sits in the `head` table.
 */
const HEAD_MAC_STYLE = 44;

/**
 * Tables an instance drops: the style attributes table, whose names point at records the instance
 * does not have, and the digital signature, which the changes break.
 */
const DROPPED_TABLES = new Set(['STAT', 'DSIG']);

/**
 * The length of the PANOSE classification in the OS/2 table, in bytes.
 */
const PANOSE_BYTES = 10;

/**
 * The `head.macStyle` bits a slot sets: bold (bit 0) and italic (bit 1).
 */
const MAC_STYLE_BITS = 0x03;

/**
 * The longest PostScript name a font may have, in characters.
 */
const MAX_POSTSCRIPT_NAME_LENGTH = 63;

/**
 * The OS/2 facts of a font that decide whether and how it is embedded.
 */
export type FontFacts = {
  /**
   * The embedding permissions (`fsType`).
   */
  fsType: number;

  /**
   * The PANOSE bytes as 20 upper-case hex digits.
   */
  panose: string;

  /**
   * `usWeightClass`.
   */
  weightClass: number;
};

/**
 * Reads the OS/2 facts of an sfnt font.
 *
 * @param font - The font.
 * @returns The facts; zeros when the font has no OS/2 table.
 */
export function fontFacts(font: Sfnt): FontFacts {
  const os2 = sfntTable(font, 'OS/2');
  if (os2 === undefined || os2.length < OS2.fsSelection + 2) {
    return {
      fsType: 0,
      panose: '0'.repeat(PANOSE_BYTES * 2),
      weightClass: SLOT_FACTS.regular.weight,
    };
  }

  const data = view(os2);
  const panose = Array.from(os2.subarray(OS2.panose, OS2.panose + PANOSE_BYTES), (byte) =>
    byte.toString(16).padStart(2, '0'),
  )
    .join('')
    .toUpperCase();
  return {
    fsType: data.getUint16(OS2.fsType),
    panose,
    weightClass: data.getUint16(OS2.weightClass),
  };
}

/**
 * Names for an instance.
 */
export type InstanceNames = {
  /**
   * The family name every face of the family shares (name id 1 and 16), at most 31 characters.
   */
  family: string;

  /**
   * The face the instance fills in its family.
   */
  slot: FontSlot;
};

/**
 * Turns a font HarfBuzz cut into a face of its own family: the `name` table rewritten (family 1 and
 * 16, subfamily 2 and 17 from the slot, full name 4, PostScript name 6, unique id 3; copyright,
 * version, license and vendor records kept from the source font), OS/2 `usWeightClass`,
 * `usWidthClass` and `fsSelection` and `head.macStyle` set for the slot so PowerPoint, Windows and
 * macOS link the faces of a family as regular, bold, italic and bold italic, `STAT` and `DSIG`
 * dropped, and every checksum recomputed.
 *
 * @param bytes - The instance HarfBuzz returned.
 * @param source - The source font's `name` table, for the records kept.
 * @param names - The family name and slot.
 * @returns The finished font, or a sentence saying why it could not be read.
 */
export function finishInstance(
  bytes: Uint8Array,
  source: Uint8Array | undefined,
  names: InstanceNames,
): Uint8Array | string {
  const parsed = readSfnt(bytes);
  if (typeof parsed === 'string') {
    return parsed;
  }

  const facts = SLOT_FACTS[names.slot];
  const trimmed: Sfnt = {
    version: parsed.version,
    tables: parsed.tables.filter((entry) => !DROPPED_TABLES.has(entry.tag)),
  };
  const named = withSlotNames(trimmed, source, names, facts);
  const styled = withSlotSelection(named, facts);
  return writeSfnt(withSlotMacStyle(styled, facts));
}

/**
 * The slot's facts, from {@link SLOT_FACTS}.
 */
type SlotFacts = (typeof SLOT_FACTS)[FontSlot];

/**
 * Replaces the `name` table with the family's names for the slot, keeping the records the source
 * font's copyright, version, license and vendor fields carry.
 *
 * @param font - The instance so far.
 * @param source - The source font's `name` table, for the records kept.
 * @param names - The family name and slot.
 * @param facts - The slot's facts.
 */
function withSlotNames(
  font: Sfnt,
  source: Uint8Array | undefined,
  names: InstanceNames,
  facts: SlotFacts,
): Sfnt {
  const kept = (source === undefined ? [] : readNames(source)).filter((record) =>
    KEPT_NAME_IDS.includes(record.nameId),
  );
  const version = kept.find((record) => record.nameId === NAME_ID.version)?.value ?? 'Version 1.0';
  const postscript = postscriptName(names.family, facts.subfamily);
  const full = names.slot === 'regular' ? names.family : `${names.family} ${facts.subfamily}`;
  const table = writeNames([
    ...kept,
    { nameId: NAME_ID.family, value: names.family },
    { nameId: NAME_ID.subfamily, value: facts.subfamily },
    { nameId: NAME_ID.unique, value: `${version};${postscript}` },
    { nameId: NAME_ID.full, value: full },
    { nameId: NAME_ID.postscript, value: postscript },
    { nameId: NAME_ID.typographicFamily, value: names.family },
    { nameId: NAME_ID.typographicSubfamily, value: facts.subfamily },
  ]);
  return withTable(font, 'name', table);
}

/**
 * Sets the OS/2 weight, width, style selection and Windows metrics for the slot. Without a usable
 * OS/2 table the font is returned unchanged.
 *
 * @param font - The instance so far.
 * @param facts - The slot's facts.
 */
function withSlotSelection(font: Sfnt, facts: SlotFacts): Sfnt {
  const os2 = sfntTable(font, 'OS/2')?.slice();
  if (os2 === undefined || os2.length < OS2.fsSelection + 2) {
    return font;
  }

  const data = view(os2);
  data.setUint16(OS2.weightClass, facts.weight);
  data.setUint16(OS2.widthClass, NORMAL_WIDTH_CLASS);
  const selection = data.getUint16(OS2.fsSelection) & ~STYLE_SELECTION_BITS;
  data.setUint16(OS2.fsSelection, selection | facts.selection);
  // Windows, PowerPoint and LibreOffice place lines with usWinAscent and usWinDescent, browsers
  // with the typographic (or hhea) metrics: the instance's Windows metrics become the ones the
  // browser used, so its lines sit where the web's did in every app.
  const hhea = sfntTable(font, 'hhea');
  if (os2.length >= OS2.winDescent + 2) {
    const useTypo = (selection & USE_TYPO_METRICS) !== 0 || hhea === undefined;
    const source = useTypo || hhea === undefined ? null : view(hhea);
    const ascent =
      source === null ? data.getInt16(OS2.typoAscender) : source.getInt16(HHEA.ascender);
    const descent =
      source === null ? data.getInt16(OS2.typoDescender) : source.getInt16(HHEA.descender);
    if (ascent > 0 && descent < 0) {
      data.setUint16(OS2.winAscent, ascent);
      data.setUint16(OS2.winDescent, -descent);
    }
  }

  return withTable(font, 'OS/2', os2);
}

/**
 * Sets the bold and italic bits of `head.macStyle` for the slot. Without a usable `head` table the
 * font is returned unchanged.
 *
 * @param font - The instance so far.
 * @param facts - The slot's facts.
 */
function withSlotMacStyle(font: Sfnt, facts: SlotFacts): Sfnt {
  const head = sfntTable(font, 'head')?.slice();
  if (head === undefined || head.length < HEAD_MAC_STYLE + 2) {
    return font;
  }

  const data = view(head);
  data.setUint16(
    HEAD_MAC_STYLE,
    (data.getUint16(HEAD_MAC_STYLE) & ~MAC_STYLE_BITS) | facts.macStyle,
  );
  return withTable(font, 'head', head);
}

/**
 * A PostScript name for a face: the family without spaces, a hyphen and the subfamily, limited to
 * the printable ASCII PostScript names allow and 63 characters.
 *
 * @param family - The family name.
 * @param subfamily - The subfamily name.
 */
export function postscriptName(family: string, subfamily: string): string {
  /**
   * Text without characters a PostScript name cannot have.
   */
  const clean = (text: string): string => text.replace(UNSAFE_POSTSCRIPT_NAME_PATTERN, '');
  return `${clean(family)}-${clean(subfamily)}`.slice(0, MAX_POSTSCRIPT_NAME_LENGTH);
}
