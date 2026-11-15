import type { BrandTokens, FontFaceRule, SubstituteTokens, TypeStep } from '@deckster/brand';

import { TYPE_STEPS } from '@deckster/brand';
import { Effect, type FileSystem } from 'effect';
import { create, type Font } from 'fontkit';

import type { FontStyleKey, FontUse } from '#fonts/font-uses.ts';

import { exportError, type ExportError } from '#export-error.ts';
import { readFontFile } from '#fonts/font-file.ts';
import { mergeCharacters } from '#fonts/font-uses.ts';
import { cutFont, loadHarfBuzz, type HarfBuzz } from '#fonts/harfbuzz.ts';
import {
  finishInstance,
  fontFacts,
  postscriptName,
  subfamilyOf,
  type FontFacts,
  type FontSlot,
} from '#fonts/instance-tables.ts';
import { readSfnt, sfntTable } from '#fonts/sfnt.ts';
import {
  EDITING_RANGES,
  inRanges,
  parseUnicodeRange,
  rangeCodePoints,
  SUBSET_RANGES,
  type CodePointRange,
} from '#fonts/unicode-ranges.ts';
import { minOf } from '#units.ts';

/**
 * The longest family name Windows (GDI's `LF_FACESIZE` less the terminator) and PowerPoint keep.
 */
export const MAX_FAMILY_NAME = 31;

/**
 * Axis precision and the normal OpenType width percentage.
 */
const AXIS_ROUNDING_FACTOR = 100;

/**
 * The normal OpenType wdth axis value, in percent.
 */
const NORMAL_WIDTH_PERCENT = 100;

/**
 * Formatting widths for hexadecimal OS/2 fields and font family word boundaries.
 */
const HEX_RADIX = 16;

/**
 * The hexadecimal width of the 16-bit OS/2 embedding flags.
 */
const FS_TYPE_HEX_DIGITS = 4;

/**
 * The number of hexadecimal digits in each PANOSE byte.
 */
const PANOSE_BYTE_HEX_DIGITS = 2;

/**
 * Whitespace separating words in a family name that must be shortened.
 */
const FAMILY_WORD_BOUNDARY_PATTERN = /\s+/;

/**
 * What instance family names put between the source family and the role, so they never clash with
 * an installed family.
 */
const NAME_MARK = 'Deck';

/**
 * `fsType` usage bits: the low nibble says how a font may be embedded.
 */
const FS_TYPE_USAGE = 0x00_0f;

/**
 * `fsType` restricted license: the font must not be embedded.
 */
const FS_TYPE_RESTRICTED = 0x00_02;

/**
 * `fsType` preview and print: the document opens read-only where it uses the font.
 */
const FS_TYPE_PREVIEW_PRINT = 0x00_04;

/**
 * `fsType` no subsetting: the whole font must be embedded.
 */
const FS_TYPE_NO_SUBSETTING = 0x01_00;

/**
 * `fsType` bitmap embedding only: outlines must not be embedded.
 */
const FS_TYPE_BITMAP_ONLY = 0x02_00;

/**
 * The weight from which the heavier of two weights fills a family's bold face.
 */
const BOLD_FROM_WEIGHT = 600;

/**
 * The smallest gap between a family's regular and bold weights.
 */
const MIN_BOLD_GAP = 100;

/**
 * Two axis values closer than this are the same instance.
 */
const AXIS_TOLERANCE = 0.5;

/**
 * The fix printed when a brand font file cannot be read or does not hold a single font.
 */
const BRAND_FONT_FIX = 'Check the brand font files.';

/**
 * The number of PANOSE bytes in an OS/2 table's classification.
 */
const PANOSE_BYTES = 10;

/**
 * PANOSE "no fit" for a byte that says nothing (`1`), which the plan reads as "not informative".
 */
const PANOSE_NO_FIT = 1;

/**
 * PANOSE family kind for Latin text.
 */
const PANOSE_LATIN_TEXT = 2;

/**
 * PANOSE family kind for hand-written (script) faces.
 */
const PANOSE_HAND_WRITTEN = 3;

/**
 * PANOSE family kind for decorative faces.
 */
const PANOSE_DECORATIVE = 4;

/**
 * PANOSE proportion for monospaced faces.
 */
const PANOSE_MONOSPACED = 9;

/**
 * The first PANOSE serif style that reads as a sans serif.
 */
const PANOSE_SANS_SERIF_FIRST = 11;

/**
 * The last PANOSE serif style that reads as a sans serif.
 */
const PANOSE_SANS_SERIF_LAST = 15;

/**
 * Pitch-and-family bytes: `VARIABLE_PITCH` (2) or `FIXED_PITCH` (1) plus the GDI family.
 */
const PITCH_FAMILY = {
  /**
   * Proportional sans (`FF_SWISS`).
   */
  sans: 0x22,

  /**
   * Proportional serif (`FF_ROMAN`).
   */
  serif: 0x12,

  /**
   * Monospace (`FF_MODERN`, fixed pitch).
   */
  mono: 0x31,

  /**
   * Script (`FF_SCRIPT`).
   */
  script: 0x42,

  /**
   * Decorative (`FF_DECORATIVE`).
   */
  decorative: 0x52,
} as const;

/**
 * A font file the brand loads, as `@deckster/brand/node` lists it.
 */
export type FontFace = Pick<FontFaceRule, 'family' | 'url' | 'weight' | 'style' | 'unicodeRange'>;

/**
 * One static font cut from a brand font for the deck.
 */
export type FontInstance = {
  /**
   * The brand family it was cut from, such as `Inter`.
   */
  sourceFamily: string;

  /**
   * The family it belongs to in the exported files, such as `Inter Deck Body`.
   */
  familyName: string;

  /**
   * The face it fills in that family.
   */
  slot: FontSlot;

  /**
   * The CSS weight it draws.
   */
  weight: number;

  /**
   * Whether it was cut from an italic font file.
   */
  italic: boolean;

  /**
   * The variation axes it was pinned at; empty for a static source font.
   */
  axes: Readonly<Record<string, number>>;

  /**
   * The TrueType font.
   */
  data: Uint8Array;

  /**
   * Its PostScript name.
   */
  postscriptName: string;

  /**
   * A file name for it, `<PostScript name>.ttf`.
   */
  fileName: string;

  /**
   * The PANOSE to write on `a:latin` and `p:font`, 20 upper-case hex digits: the font's own when it
   * says what kind of letterform it is, else its substitute's (the font file keeps its own).
   */
  panose: string;

  /**
   * Its pitch-and-family byte.
   */
  pitchFamily: number;

  /**
   * Its charset byte: 0, ANSI.
   */
  charset: number;

  /**
   * The source font's embedding permissions.
   */
  fsType: number;

  /**
   * The source font file.
   */
  source: string;

  /**
   * The characters it can draw, from the deck's text and the editing set.
   */
  characters: ReadonlySet<number>;
};

/**
 * A family as `p:embeddedFont` lists it: a typeface and up to four faces.
 */
export type EmbeddedFamily = {
  /**
   * The typeface name runs refer to.
   */
  typeface: string;

  /**
   * The brand family it comes from.
   */
  sourceFamily: string;

  /**
   * The PANOSE of its first face.
   */
  panose: string;

  /**
   * Its pitch-and-family byte.
   */
  pitchFamily: number;

  /**
   * Its charset byte.
   */
  charset: number;

  /**
   * Its faces by slot.
   */
  slots: Partial<Record<FontSlot, FontInstance>>;
};

/**
 * The font a run is written in.
 */
export type ResolvedFont = {
  /**
   * The typeface name for `a:latin`.
   */
  typeface: string;

  /**
   * Whether the run sets `b="1"` to reach the face.
   */
  bold: boolean;

  /**
   * Whether the run sets `i="1"` to reach the face (or, for a family without an italic face, to
   * have the app slant it, as the browser did).
   */
  italic: boolean;

  /**
   * The PANOSE for `a:latin`.
   */
  panose: string;

  /**
   * The pitch-and-family byte for `a:latin`.
   */
  pitchFamily: number;

  /**
   * The charset byte for `a:latin`.
   */
  charset: number;
};

/**
 * Characters a brand font file does not have, which stay in the substitute.
 */
export type MissingCharacters = {
  /**
   * The brand family.
   */
  family: string;

  /**
   * The characters.
   */
  characters: string;
};

/**
 * A brand font file an instance was cut from, with its variation axes.
 */
export type FontSourceAxes = {
  /**
   * The brand family.
   */
  family: string;

  /**
   * The style the file draws.
   */
  style: 'normal' | 'italic';

  /**
   * The file.
   */
  url: string;

  /**
   * Its variation axes by tag, empty for a static font.
   */
  axes: Readonly<Record<string, { min: number; default: number; max: number }>>;
};

/**
 * The fonts an export embeds and how runs refer to them.
 */
export type FontPlan = {
  /**
   * The static instances, in family order.
   */
  instances: readonly FontInstance[];

  /**
   * The families to list in `p:embeddedFontLst`.
   */
  families: readonly EmbeddedFamily[];

  /**
   * Characters of the deck that no embedded instance has.
   */
  missing: readonly MissingCharacters[];

  /**
   * Things the report should say, such as a font that only allows preview and print.
   */
  warnings: readonly string[];

  /**
   * The brand font files the instances were cut from, with their variation axes, for matching
   * rendered text to instances in the page (`staticFontsArgs`).
   */
  sources: readonly FontSourceAxes[];

  /**
   * The embedded font for a run style, or `null` when the run's family is not embedded (not a brand
   * family, a system or unavailable font, or text with characters the instance lacks): write the
   * run in {@link FontPlan.substituteFor} then.
   */
  resolve: (style: FontStyleKey, text?: string) => ResolvedFont | null;

  /**
   * The installed family a brand family falls back to, or `null` for a family that is not the
   * brand's.
   */
  substituteFor: (family: string) => SubstituteTokens | null;
};

/**
 * A plan that embeds nothing: every brand family is written as its substitute. For
 * `--no-embed-fonts` and `--fonts system`.
 *
 * @param brand - The resolved brand.
 */
export function emptyFontPlan(brand: BrandTokens): FontPlan {
  return {
    instances: [],
    families: [],
    missing: [],
    warnings: [],
    sources: [],
    resolve: () => null,
    substituteFor: substitutes(brand),
  };
}

/**
 * A brand font file with what the plan reads from it.
 */
type LoadedFace = {
  /**
   * The face.
   */
  face: FontFace;

  /**
   * The decoded sfnt font.
   */
  sfnt: Uint8Array;

  /**
   * The parsed font, for coverage and axes.
   */
  font: Font;

  /**
   * Its variation axes by tag.
   */
  axes: Readonly<Record<string, { min: number; default: number; max: number }>>;

  /**
   * Its OS/2 facts.
   */
  facts: FontFacts;

  /**
   * Its `name` table.
   */
  names: Uint8Array | undefined;
};

/**
 * An instance before it is cut: the face, the axes and the characters.
 */
type PendingInstance = {
  /**
   * The key: face file and axes.
   */
  key: string;

  /**
   * The face it is cut from.
   */
  loaded: LoadedFace;

  /**
   * The axes it is pinned at.
   */
  axes: Record<string, number>;

  /**
   * The CSS weight it draws.
   */
  weight: number;

  /**
   * The font size of the first run set in it, which picks the type step it is named after.
   */
  size: number;

  /**
   * The characters the deck sets in it.
   */
  text: string;
};

/**
 * Cuts the static fonts an export embeds: for every distinct (family, axes, italic) the slides set
 * text in, a TrueType instance of the brand's font file at those axes (the optical size following
 * the font size where the run does not set it), subset to the characters used plus an editing set
 * (Latin basic and Latin-1, common punctuation, and the brand's declared subsets the file covers),
 * every layout feature kept. Instances that differ only in weight share a family with regular and
 * bold faces (bold from {@link BOLD_FROM_WEIGHT}), and italic files fill the italic faces;
 * everything else is a family of its own, named after the brand's type step that uses it, such as
 * `Inter Deck Body` or `Bricolage Deck Headline` (at most {@link MAX_FAMILY_NAME} characters,
 * stable across runs). Fonts whose `fsType` forbids embedding are refused.
 *
 * @param uses - The styles the slides set text in, from `fontUses`.
 * @param faces - The brand's font files.
 * @param brand - The resolved brand, for type step names and substitutes.
 * @returns The plan.
 * @throws ExportError in the error channel when a font cannot be read or cut, or forbids
 * embedding.
 */
export const instanceFonts = Effect.fn('instanceFonts')(function* (
  uses: readonly FontUse[],
  faces: readonly FontFace[],
  brand: BrandTokens,
): Effect.fn.Return<FontPlan, ExportError, FileSystem.FileSystem> {
  const hb = yield* loadHarfBuzz();
  const loaded = new Map<string, LoadedFace>();
  const missing = new Map<string, string>();
  const warnings: string[] = [];
  const pending = yield* collectPending(uses, faces, loaded, missing, warnings);
  const families = assignFamilies([...pending.values()], brand);
  const instances = yield* cutFamilies(hb, families, brand);
  const embedded = embeddedFamilies(instances);
  return {
    instances,
    families: embedded,
    missing: [...missing.entries()].map(([family, characters]) => ({ family, characters })),
    warnings,
    sources: [...loaded.values()].map((entry) => ({
      family: entry.face.family,
      style: entry.face.style,
      url: entry.face.url,
      axes: entry.axes,
    })),
    resolve: resolver(faces, loaded, instances),
    substituteFor: substitutes(brand),
  };
});

/**
 * Reads the brand font file each used style renders with, checks that it may be embedded, and
 * collects the instance each style needs, keyed by file and axes. Characters a file has no glyph
 * for are noted as missing for their family.
 *
 * @param uses - The styles the slides set text in.
 * @param faces - The brand's font files.
 * @param loaded - Receives each font read, by file URL.
 * @param missing - Receives the characters each brand family lacks, by family.
 * @param warnings - Receives the embedding warnings.
 */
const collectPending = Effect.fn('collectPending')(function* (
  uses: readonly FontUse[],
  faces: readonly FontFace[],
  loaded: Map<string, LoadedFace>,
  missing: Map<string, string>,
  warnings: string[],
): Effect.fn.Return<Map<string, PendingInstance>, ExportError, FileSystem.FileSystem> {
  const pending = new Map<string, PendingInstance>();
  for (const use of uses) {
    const face = pickFace(faces, use);
    if (face === undefined) {
      continue;
    }

    const entry = loaded.get(face.url) ?? (yield* loadFace(face));
    loaded.set(face.url, entry);
    yield* checkEmbedding(entry, warnings);
    const axes = effectiveAxes(entry, use);
    const key = `${face.url}|${axesKey(axes)}`;
    const instance = pending.get(key) ?? {
      key,
      loaded: entry,
      axes,
      weight: use.weight,
      size: use.size,
      text: '',
    };
    instance.text = mergeCharacters(instance.text, use.text);
    pending.set(key, instance);
    const lacking = Array.from(use.text).filter(
      (character) =>
        character.trim() !== '' && !entry.font.hasGlyphForCodePoint(character.codePointAt(0) ?? 0),
    );
    if (lacking.length > 0) {
      missing.set(use.family, mergeCharacters(missing.get(use.family) ?? '', lacking.join('')));
    }
  }

  return pending;
});

/**
 * Cuts every planned family's faces and names them, with the PANOSE and pitch-and-family bytes they
 * are described with.
 *
 * @param hb - HarfBuzz.
 * @param families - The planned families.
 * @param brand - The brand, for editing subsets and substitutes.
 */
const cutFamilies = Effect.fn('cutFamilies')(function* (
  hb: HarfBuzz,
  families: readonly PlannedFamily[],
  brand: BrandTokens,
): Effect.fn.Return<FontInstance[], ExportError> {
  const instances: FontInstance[] = [];
  const editing = editingRanges(brand);
  for (const family of families) {
    for (const [slot, member] of family.members) {
      const instance = yield* cutInstance(hb, member, family.name, slot, editing);
      const substitute = substitutes(brand)(member.loaded.face.family);
      const panose = informativePanose(instance.panose) ? instance.panose : substitute?.panose;
      instances.push({
        ...instance,
        panose: panose ?? instance.panose,
        pitchFamily: pitchFamily(instance.panose, substitute),
      });
    }
  }

  return instances;
});

/**
 * Reads a brand font file.
 *
 * @param face - The face.
 */
const loadFace = Effect.fn('loadFace')(function* (
  face: FontFace,
): Effect.fn.Return<LoadedFace, ExportError, FileSystem.FileSystem> {
  const sfnt = yield* readFontFile(face.url);
  const parsed = readSfnt(sfnt);
  const font = yield* Effect.try({
    try: () => create(Buffer.from(sfnt)),
    catch: (cause) => exportError(`read the font ${face.url}`, cause, BRAND_FONT_FIX),
  });
  if (typeof parsed === 'string' || !('hasGlyphForCodePoint' in font)) {
    return yield* exportError(
      `read the font ${face.url}`,
      typeof parsed === 'string' ? parsed : 'it is a font collection',
      BRAND_FONT_FIX,
    );
  }

  const axes: Record<string, { min: number; default: number; max: number }> = {};
  for (const [tag, axis] of Object.entries(font.variationAxes)) {
    if (axis !== undefined) {
      axes[tag] = { min: axis.min, default: axis.default, max: axis.max };
    }
  }

  return { face, sfnt, font, axes, facts: fontFacts(parsed), names: sfntTable(parsed, 'name') };
});

/**
 * Fails for a font whose `fsType` forbids embedding (restricted license, or bitmaps only), and
 * warns about one that allows preview and print only.
 *
 * @param loaded - The font.
 * @param warnings - Collects warnings.
 */
const checkEmbedding = Effect.fn('checkEmbedding')(function* (
  loaded: LoadedFace,
  warnings: string[],
): Effect.fn.Return<void, ExportError> {
  const { fsType } = loaded.facts;
  const { family, url } = loaded.face;
  const usage = fsType & FS_TYPE_USAGE;
  if (usage === FS_TYPE_RESTRICTED || (fsType & FS_TYPE_BITMAP_ONLY) !== 0) {
    const reason = usage === FS_TYPE_RESTRICTED ? 'restricted license' : 'bitmap embedding only';
    const fsTypeHex = fsType.toString(HEX_RADIX).padStart(FS_TYPE_HEX_DIGITS, '0');
    return yield* exportError(
      `embed ${family}`,
      `${url} does not allow embedding (OS/2 fsType 0x${fsTypeHex}, ${reason})`,
      `Pass --no-embed-fonts to export without embedding; ` +
        `${family} is then written as its substitute.`,
    );
  }

  const warning =
    `${family} allows preview and print embedding only: ` +
    `PowerPoint opens the file read-only on machines without ${family}.`;
  if (usage === FS_TYPE_PREVIEW_PRINT && !warnings.includes(warning)) {
    warnings.push(warning);
  }
});

/**
 * The brand font file a style renders with, as the browser picks it: the family's files in the
 * style (an upright file when there is no italic one, which the browser slants), the weight range
 * that holds the weight or else the nearest weight, then the subset file that covers most of the
 * text.
 *
 * @param faces - The brand's font files.
 * @param style - The style, with its text when known.
 */
function pickFace(
  faces: readonly FontFace[],
  style: Pick<FontStyleKey, 'family' | 'weight' | 'italic'> & { text?: string },
): FontFace | undefined {
  const family = faces.filter((face) => face.family === style.family);
  const italic = family.filter((face) => face.style === 'italic');
  const styled =
    style.italic && italic.length > 0 ? italic : family.filter((face) => face.style === 'normal');
  if (styled.length === 0) {
    return undefined;
  }

  /**
   * How far a face's weight is from the style's.
   */
  const distance = (face: FontFace): number => {
    if (typeof face.weight === 'number') {
      return Math.abs(face.weight - style.weight);
    }

    const [min, max] = face.weight;
    if (style.weight < min) {
      return min - style.weight;
    }

    return Math.max(0, style.weight - max);
  };
  const nearest = minOf(styled.map(distance));
  const weighted = styled.filter((face) => distance(face) === nearest);
  const text = Array.from(style.text ?? '').map((character) => character.codePointAt(0) ?? 0);
  /**
   * How many of the text's characters a face's unicode-range covers.
   */
  const coverage = (face: FontFace): number => {
    if (face.unicodeRange === undefined) {
      return text.length + 1;
    }

    const ranges = parseUnicodeRange(face.unicodeRange);
    return text.filter((codePoint) => inRanges(ranges, codePoint)).length;
  };
  return [...weighted].sort((a, b) => coverage(b) - coverage(a))[0];
}

/**
 * The axes an instance is pinned at for a style: each axis the font has, at the style's value
 * (`wght` from the weight, `ital` from the style, `opsz` from the font size when the style does not
 * set it, as `font-optical-sizing: auto` does), else its default, clamped to the axis range and
 * rounded to a hundredth.
 *
 * @param loaded - The font.
 * @param style - The style.
 */
function effectiveAxes(
  loaded: Pick<LoadedFace, 'axes'>,
  style: Pick<FontStyleKey, 'weight' | 'italic' | 'axes' | 'size'>,
): Record<string, number> {
  const axes: Record<string, number> = {};
  for (const [tag, axis] of Object.entries(loaded.axes)) {
    const implied: Record<string, number> = {
      wght: style.weight,
      opsz: style.size,
      ital: Number(style.italic),
    };
    const value = style.axes[tag] ?? implied[tag] ?? axis.default;
    axes[tag] =
      Math.round(Math.min(axis.max, Math.max(axis.min, value)) * AXIS_ROUNDING_FACTOR) /
      AXIS_ROUNDING_FACTOR;
  }

  return axes;
}

/**
 * A stable key for axis values.
 *
 * @param axes - The axes.
 */
function axesKey(axes: Readonly<Record<string, number>>): string {
  return Object.entries(axes)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([tag, value]) => `${tag}=${value}`)
    .join(',');
}

/**
 * A family of instances before they are cut.
 */
type PlannedFamily = {
  /**
   * The family name.
   */
  name: string;

  /**
   * Its faces.
   */
  members: Map<FontSlot, PendingInstance>;
};

/**
 * Sorts instances into families: those of one brand family that differ only in weight and italics
 * share a family, the lightest weight in the regular and italic faces and the heaviest (from
 * {@link BOLD_FROM_WEIGHT}, at least {@link MIN_BOLD_GAP} heavier) in the bold faces; a family set
 * only from {@link BOLD_FROM_WEIGHT} up has its lightest weight in the bold faces; any other weight
 * gets a family of its own, in the bold faces from {@link BOLD_FROM_WEIGHT}. Families are named
 * after the type step that uses their regular face, and sorted by name so names and parts are
 * stable.
 *
 * @param pending - The instances.
 * @param brand - The brand, for type step names.
 */
function assignFamilies(pending: readonly PendingInstance[], brand: BrandTokens): PlannedFamily[] {
  const groups = groupInstances(pending);
  const planned: FamilyCandidate[] = [];
  for (const group of groups.values()) {
    assignGroupFamilies(group, brand, planned);
  }

  return nameFamilies(planned);
}

/**
 * A family whose role is chosen but whose final unique name has not been assigned.
 */
type FamilyCandidate = {
  /**
   * The brand type step or axis description used in its name.
   */
  role: string;

  /**
   * The source font family.
   */
  family: string;

  /**
   * Its style-linked faces in insertion order.
   */
  members: Map<FontSlot, PendingInstance>;
};

/**
 * Groups instances by family and by every axis except weight and italics.
 *
 * @param pending - The instances, in first-use order.
 */
function groupInstances(pending: readonly PendingInstance[]): Map<string, PendingInstance[]> {
  const groups = new Map<string, PendingInstance[]>();
  for (const instance of pending) {
    const { wght: _wght, ital: _ital, ...rest } = instance.axes;
    const signature = `${instance.loaded.face.family}|${axesKey(rest)}`;
    groups.set(signature, [...(groups.get(signature) ?? []), instance]);
  }

  return groups;
}

/**
 * Assigns the regular and bold faces of one group, keeping extra weights in separate families.
 *
 * @param group - Instances with matching family and non-style axes.
 * @param brand - The brand used to name each family's role.
 * @param planned - Receives families in the same first-use order as their instances.
 */
function assignGroupFamilies(
  group: readonly PendingInstance[],
  brand: BrandTokens,
  planned: FamilyCandidate[],
): void {
  const weights = [...new Set(group.map((instance) => instance.weight))].sort((a, b) => a - b);
  const base = weights[0] ?? 0;
  const heaviest = weights.at(-1) ?? base;
  // A family set only in heavy weights puts its lightest in the bold faces, so apps that do not
  // use the embedded font still set it in a bold substitute.
  const heavyOnly = base >= BOLD_FROM_WEIGHT;
  const pairsBold = heaviest >= BOLD_FROM_WEIGHT && heaviest - base >= MIN_BOLD_GAP;
  let bold: number | undefined = pairsBold ? heaviest : undefined;
  if (heavyOnly) {
    bold = base;
  }

  const main = new Map<FontSlot, PendingInstance>();
  for (const instance of group) {
    const italic = instance.loaded.face.style === 'italic';
    const slot = slotOf(instance.weight === bold, italic);
    if ((instance.weight === base || instance.weight === bold) && !main.has(slot)) {
      main.set(slot, instance);
    } else {
      assignIndividualFamily(instance, brand, planned);
    }
  }

  const first =
    main.get('regular') ?? main.get('italic') ?? main.get('bold') ?? main.values().next().value;
  if (first !== undefined) {
    planned.push({
      role: roleName(first, brand),
      family: first.loaded.face.family,
      members: main,
    });
  }
}

/**
 * Reuses a separate family's matching weight and axes, or starts one at this instance.
 *
 * @param instance - An extra weight outside the group's main regular and bold pair.
 * @param brand - The brand used to name its role.
 * @param planned - The families assigned so far, including earlier groups.
 */
function assignIndividualFamily(
  instance: PendingInstance,
  brand: BrandTokens,
  planned: FamilyCandidate[],
): void {
  const italic = instance.loaded.face.style === 'italic';
  const own = planned.find(
    (entry) =>
      entry.members.values().next().value?.weight === instance.weight &&
      sameSignature(entry.members, instance),
  );
  if (own === undefined) {
    planned.push({
      role: roleName(instance, brand),
      family: instance.loaded.face.family,
      members: new Map([[slotOf(instance.weight >= BOLD_FROM_WEIGHT, italic), instance]]),
    });
  } else {
    own.members.set(slotOf(instance.weight >= BOLD_FROM_WEIGHT, italic), instance);
  }
}

/**
 * Sorts family names and adds stable numeric suffixes where their shortened names collide.
 *
 * @param planned - Families in first-use order.
 */
function nameFamilies(planned: readonly FamilyCandidate[]): PlannedFamily[] {
  const used = new Set<string>();
  return planned
    .map((entry) => ({ ...entry, base: familyName(entry.family, entry.role) }))
    .sort((a, b) => Number(a.base > b.base) - Number(a.base < b.base))
    .map((entry) => {
      let name = entry.base;
      for (let suffix = 2; used.has(name); suffix += 1) {
        const tail = ` ${suffix}`;
        name = `${entry.base.slice(0, MAX_FAMILY_NAME - tail.length).trimEnd()}${tail}`;
      }

      used.add(name);
      return { name, members: entry.members };
    });
}

/**
 * Whether an instance belongs with a family's members: same brand family and the same axes other
 * than weight.
 *
 * @param members - The family's members.
 * @param instance - The instance.
 */
function sameSignature(
  members: ReadonlyMap<FontSlot, PendingInstance>,
  instance: PendingInstance,
): boolean {
  const other = members.values().next().value;
  if (other === undefined) {
    return false;
  }

  /**
   * The key of axes without weight and italics.
   */
  const strip = (axes: Record<string, number>): string => {
    const { wght: _wght, ital: _ital, ...rest } = axes;
    return axesKey(rest);
  };
  return (
    other.loaded.face.family === instance.loaded.face.family &&
    strip(other.axes) === strip(instance.axes)
  );
}

/**
 * The slot of a face.
 *
 * @param bold - Whether it is the family's bold weight.
 * @param italic - Whether it is italic.
 */
function slotOf(bold: boolean, italic: boolean): FontSlot {
  if (bold) {
    return italic ? 'boldItalic' : 'bold';
  }

  return italic ? 'italic' : 'regular';
}

/**
 * The role an instance plays, for its family name: the type step of the brand drawn with exactly
 * this instance (same family, weight, style and axes) whose size is nearest the text set in it,
 * such as `Headline`; else its weight, optical size and width, such as `W450 O24`.
 *
 * @param instance - The instance.
 * @param brand - The brand.
 */
function roleName(instance: PendingInstance, brand: BrandTokens): string {
  const family = instance.loaded.face.family;
  const italic = instance.loaded.face.style === 'italic';
  const matches = TYPE_STEPS.filter((name: TypeStep) => {
    const spec = brand.typography.scale[name];
    if (brand.typography.families[spec.family].family !== family) {
      return false;
    }

    if ((spec.style === 'italic') !== italic || spec.weight !== instance.weight) {
      return false;
    }

    const axes = effectiveAxes(instance.loaded, {
      weight: spec.weight,
      italic,
      axes: spec.axes,
      size: spec.size,
    });
    return closeAxes(axes, instance.axes);
  });
  const step = [...matches].sort(
    (a, b) =>
      Math.abs(brand.typography.scale[a].size - instance.size) -
      Math.abs(brand.typography.scale[b].size - instance.size),
  )[0];
  if (step !== undefined) {
    return `${step[0]?.toUpperCase() ?? ''}${step.slice(1)}`;
  }

  const parts = [`W${Math.round(instance.weight)}`];
  const { opsz, wdth } = instance.axes;
  if (opsz !== undefined) {
    parts.push(`O${Math.round(opsz)}`);
  }

  if (wdth !== undefined && Math.round(wdth) !== NORMAL_WIDTH_PERCENT) {
    parts.push(`S${Math.round(wdth)}`);
  }

  return parts.join(' ');
}

/**
 * Whether two sets of axes match within {@link AXIS_TOLERANCE}.
 *
 * @param a - Axes.
 * @param b - Other axes.
 */
function closeAxes(
  a: Readonly<Record<string, number>>,
  b: Readonly<Record<string, number>>,
): boolean {
  const tags = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...tags].every(
    (tag) =>
      a[tag] !== undefined &&
      b[tag] !== undefined &&
      Math.abs((a[tag] ?? 0) - (b[tag] ?? 0)) <= AXIS_TOLERANCE,
  );
}

/**
 * The longest role a family name usually carries, which decides whether a family's names use its
 * whole name or its first word, so every instance of one family is named the same way.
 */
const LONGEST_ROLE = 'Headline';

/**
 * A family name for an instance family: `<family> Deck <role>`, or `<first word> Deck <role>` for a
 * family whose name with {@link LONGEST_ROLE} would be longer than {@link MAX_FAMILY_NAME}, cut to
 * that length.
 *
 * @param family - The brand family.
 * @param role - The role, such as `Headline`.
 */
export function familyName(family: string, role: string): string {
  const long = `${family} ${NAME_MARK} ${LONGEST_ROLE}`.length > MAX_FAMILY_NAME;
  const base = long ? (family.split(FAMILY_WORD_BOUNDARY_PATTERN)[0] ?? family) : family;
  return `${base} ${NAME_MARK} ${role}`.slice(0, MAX_FAMILY_NAME).trimEnd();
}

/**
 * The code points every instance keeps for editing: {@link EDITING_RANGES} and the brand's declared
 * Fontsource subsets.
 *
 * @param brand - The brand.
 */
function editingRanges(brand: BrandTokens): CodePointRange[] {
  const subsets = Object.values(brand.typography.families).flatMap((family) =>
    family.source.kind === 'fontsource' ? (family.source.subsets ?? []) : [],
  );
  return [...EDITING_RANGES, ...subsets.flatMap((subset) => SUBSET_RANGES[subset] ?? [])];
}

/**
 * Cuts one instance and names it.
 *
 * @param hb - HarfBuzz.
 * @param instance - The instance.
 * @param family - Its family name.
 * @param slot - Its face in the family.
 * @param editing - The editing set.
 */
const cutInstance = Effect.fn('cutInstance')(function* (
  hb: HarfBuzz,
  instance: PendingInstance,
  family: string,
  slot: FontSlot,
  editing: readonly CodePointRange[],
): Effect.fn.Return<Omit<FontInstance, 'pitchFamily'>, ExportError> {
  const { loaded } = instance;
  const wanted = [
    ...Array.from(instance.text).map((character) => character.codePointAt(0) ?? 0),
    ...rangeCodePoints(editing),
  ];
  const whole = (loaded.facts.fsType & FS_TYPE_NO_SUBSETTING) !== 0;
  const codePoints = whole
    ? loaded.font.characterSet
    : [...new Set(wanted)].filter((codePoint) => loaded.font.hasGlyphForCodePoint(codePoint));
  const fix = 'Pass --no-embed-fonts to export without embedding the brand fonts.';
  const cut = cutFont(hb, loaded.sfnt, { codePoints, axes: instance.axes });
  if (typeof cut === 'string') {
    return yield* exportError(`cut an instance of ${loaded.face.family}`, cut, fix);
  }

  const data = finishInstance(cut, loaded.names, { family, slot });
  if (typeof data === 'string') {
    return yield* exportError(`name the instance ${family}`, data, fix);
  }

  const parsed = readSfnt(data);
  const facts = typeof parsed === 'string' ? loaded.facts : fontFacts(parsed);
  const postscript = postscriptName(family, subfamilyOf(slot));
  return {
    sourceFamily: loaded.face.family,
    familyName: family,
    slot,
    weight: instance.weight,
    italic: loaded.face.style === 'italic',
    axes: instance.axes,
    data,
    postscriptName: postscript,
    fileName: `${postscript}.ttf`,
    panose: facts.panose,
    charset: 0,
    fsType: loaded.facts.fsType,
    source: loaded.face.url,
    characters: new Set(codePoints),
  };
});

/**
 * The pitch-and-family byte of a font from its PANOSE: monospaced (proportion 9) is fixed pitch
 * `FF_MODERN`; Latin text with a sans serif style (11 to 15) is `FF_SWISS`, with another known
 * style `FF_ROMAN`; hand-written is `FF_SCRIPT`, decorative `FF_DECORATIVE`. A PANOSE whose kind or
 * serif style is "any" or "no fit" falls back to the substitute's byte.
 *
 * @param panose - 20 hex digits.
 * @param substitute - The family's substitute.
 */
export function pitchFamily(panose: string, substitute: SubstituteTokens | null): number {
  const bytes = Array.from({ length: PANOSE_BYTES }, (_, index) =>
    Number.parseInt(panose.slice(index * 2, index * 2 + 2), 16),
  );
  const [kind = 0, serif = 0, , proportion = 0] = bytes;
  if (proportion === PANOSE_MONOSPACED) {
    return PITCH_FAMILY.mono;
  }

  if (kind === PANOSE_LATIN_TEXT && serif > PANOSE_NO_FIT) {
    const sansSerif = serif >= PANOSE_SANS_SERIF_FIRST && serif <= PANOSE_SANS_SERIF_LAST;
    return sansSerif ? PITCH_FAMILY.sans : PITCH_FAMILY.serif;
  }

  if (kind === PANOSE_HAND_WRITTEN) {
    return PITCH_FAMILY.script;
  }

  if (kind === PANOSE_DECORATIVE) {
    return PITCH_FAMILY.decorative;
  }

  return substitute?.pitchFamily ?? PITCH_FAMILY.sans;
}

/**
 * Whether a PANOSE says what kind of letterform the font is: a family kind and a serif style other
 * than "any" (0) and "no fit" (1). Fraunces, for one, leaves every byte at 0; such a font is
 * described to apps with its substitute's PANOSE instead.
 *
 * @param panose - 20 hex digits.
 */
function informativePanose(panose: string): boolean {
  const kind = Number.parseInt(panose.slice(0, 2), 16);
  const serif = Number.parseInt(
    panose.slice(PANOSE_BYTE_HEX_DIGITS, PANOSE_BYTE_HEX_DIGITS * 2),
    HEX_RADIX,
  );
  return kind > PANOSE_NO_FIT && (kind !== PANOSE_LATIN_TEXT || serif > PANOSE_NO_FIT);
}

/**
 * The families of the instances, in order.
 *
 * @param instances - The instances.
 */
function embeddedFamilies(instances: readonly FontInstance[]): EmbeddedFamily[] {
  const families = new Map<string, EmbeddedFamily>();
  for (const instance of instances) {
    const family = families.get(instance.familyName) ?? {
      typeface: instance.familyName,
      sourceFamily: instance.sourceFamily,
      panose: instance.panose,
      pitchFamily: instance.pitchFamily,
      charset: instance.charset,
      slots: {},
    };
    family.slots[instance.slot] = instance;
    families.set(instance.familyName, family);
  }

  return [...families.values()];
}

/**
 * The run resolver of a plan: picks the face as the browser did, computes the instance's axes, and
 * finds the instance with them; `null` when there is none or the text has characters it lacks.
 *
 * @param faces - The brand's font files.
 * @param loaded - The fonts read for the plan.
 * @param instances - The instances.
 */
function resolver(
  faces: readonly FontFace[],
  loaded: ReadonlyMap<string, LoadedFace>,
  instances: readonly FontInstance[],
): FontPlan['resolve'] {
  return (style, text) => {
    const face = pickFace(faces, { ...style, ...(text === undefined ? {} : { text }) });
    const entry = face === undefined ? undefined : loaded.get(face.url);
    if (face === undefined || entry === undefined) {
      return null;
    }

    const axes = effectiveAxes(entry, style);
    const instance = instances.find(
      (candidate) => candidate.source === face.url && closeAxes(candidate.axes, axes),
    );
    if (instance === undefined) {
      return null;
    }

    const lacking = Array.from(text ?? '').some(
      (character) =>
        character.trim() !== '' && !instance.characters.has(character.codePointAt(0) ?? 0),
    );
    if (lacking) {
      return null;
    }

    const bold = instance.slot === 'bold' || instance.slot === 'boldItalic';
    const italicFace = instance.slot === 'italic' || instance.slot === 'boldItalic';
    return {
      typeface: instance.familyName,
      bold,
      italic: italicFace || style.italic,
      panose: instance.panose,
      pitchFamily: instance.pitchFamily,
      charset: instance.charset,
    };
  };
}

/**
 * Looks up the substitute of a brand family.
 *
 * @param brand - The brand.
 */
function substitutes(brand: BrandTokens): FontPlan['substituteFor'] {
  return (family) =>
    Object.values(brand.typography.families).find((candidate) => candidate.family === family)
      ?.substitute ?? null;
}
