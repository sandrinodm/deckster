import type { SubstituteTokens } from '#resolve/brand-tokens.ts';
import type { FontFamily } from '#schema/typography-schema.ts';

import { ownValue } from '#resolve/own-value.ts';

/**
 * What PowerPoint writes for a family it knows: PANOSE, pitch-and-family and the kind of
 * letterform.
 */
type KnownFamily = Pick<SubstituteTokens, 'panose' | 'pitchFamily' | 'category'>;

/**
 * Pitch-and-family of a proportional sans (`VARIABLE_PITCH | FF_SWISS`).
 */
const SANS_PITCH = 34;

/**
 * Pitch-and-family of a proportional serif (`VARIABLE_PITCH | FF_ROMAN`).
 */
const SERIF_PITCH = 18;

/**
 * Pitch-and-family of a monospace face (`FIXED_PITCH | FF_MODERN`).
 */
const MONO_PITCH = 49;

/**
 * Families installed with Windows and macOS (or Office on both), with the PANOSE bytes and
 * pitch-and-family PowerPoint writes for them, by lower-case name.
 */
const KNOWN_FAMILIES: Readonly<Record<string, KnownFamily>> = {
  /**
   * Arial: Windows, macOS.
   */
  arial: { panose: '020B0604020202020204', pitchFamily: SANS_PITCH, category: 'sans' },

  /**
   * Helvetica: macOS.
   */
  helvetica: { panose: '020B0604020202020204', pitchFamily: SANS_PITCH, category: 'sans' },

  /**
   * Verdana: Windows, macOS.
   */
  verdana: { panose: '020B0604030504040204', pitchFamily: SANS_PITCH, category: 'sans' },

  /**
   * Tahoma: Windows, macOS.
   */
  tahoma: { panose: '020B0604030504040204', pitchFamily: SANS_PITCH, category: 'sans' },

  /**
   * Trebuchet MS: Windows, macOS.
   */
  'trebuchet ms': { panose: '020B0603020202020204', pitchFamily: SANS_PITCH, category: 'sans' },

  /**
   * Calibri: Office.
   */
  calibri: { panose: '020F0502020204030204', pitchFamily: SANS_PITCH, category: 'sans' },

  /**
   * Aptos: Office since 2023.
   */
  aptos: { panose: '020B0004020202020204', pitchFamily: SANS_PITCH, category: 'sans' },

  /**
   * Segoe UI: Windows.
   */
  'segoe ui': { panose: '020B0502040204020203', pitchFamily: SANS_PITCH, category: 'sans' },

  /**
   * Georgia: Windows, macOS.
   */
  georgia: { panose: '02040502050405020303', pitchFamily: SERIF_PITCH, category: 'serif' },

  /**
   * Times New Roman: Windows, macOS.
   */
  'times new roman': {
    panose: '02020603050405020304',
    pitchFamily: SERIF_PITCH,
    category: 'serif',
  },

  /**
   * Cambria: Office.
   */
  cambria: { panose: '02040503050406030204', pitchFamily: SERIF_PITCH, category: 'serif' },

  /**
   * Courier New: Windows, macOS.
   */
  'courier new': { panose: '02070309020205020404', pitchFamily: MONO_PITCH, category: 'mono' },

  /**
   * Consolas: Windows, Office.
   */
  consolas: { panose: '020B0609020204030204', pitchFamily: MONO_PITCH, category: 'mono' },

  /**
   * Menlo: macOS.
   */
  menlo: { panose: '020B0609030804020204', pitchFamily: MONO_PITCH, category: 'mono' },
};

/**
 * The substitute a family gets without one of its own, by the generic family its fallback stack
 * ends in.
 */
const DEFAULT_SUBSTITUTE: Readonly<Record<SubstituteTokens['category'], string>> = {
  /**
   * Sans-serif and anything else.
   */
  sans: 'Arial',

  /**
   * Serif.
   */
  serif: 'Georgia',

  /**
   * Monospace.
   */
  mono: 'Courier New',
};

/**
 * Generic CSS families by the kind of letterform they ask for; the rest count as sans.
 */
const GENERIC_CATEGORY: Readonly<Record<string, SubstituteTokens['category']>> = {
  /**
   * `serif`.
   */
  serif: 'serif',

  /**
   * `ui-serif`.
   */
  'ui-serif': 'serif',

  /**
   * `monospace`.
   */
  monospace: 'mono',

  /**
   * `ui-monospace`.
   */
  'ui-monospace': 'mono',
};

/**
 * PANOSE of a family PowerPoint does not know: every byte "any".
 */
const UNKNOWN_PANOSE = '00000000000000000000';

/**
 * The kind of letterform a family's CSS fallback stack asks for: its first known family's, else its
 * generic family's, else sans.
 *
 * @param family - The family as the brand writes it.
 */
export function stackCategory(family: Pick<FontFamily, 'fallback'>): SubstituteTokens['category'] {
  for (const name of family.fallback) {
    const known = knownFamily(name);
    if (known !== undefined) {
      return known.category;
    }

    const generic = ownValue(GENERIC_CATEGORY, name);
    if (generic !== undefined) {
      return generic;
    }
  }

  return 'sans';
}

/**
 * The kind of letterform of a known installed family, or `undefined` for one this module does not
 * know.
 *
 * @param name - The family name.
 */
export function knownCategory(name: string): SubstituteTokens['category'] | undefined {
  return knownFamily(name)?.category;
}

/**
 * A family's substitute with every field filled in: the brand's own, completed from the known
 * families, else the first known family of its fallback stack, else Arial, Georgia or Courier New
 * by the stack's generic family.
 *
 * @param family - The family as the brand writes it.
 */
export function resolveSubstitute(family: FontFamily): SubstituteTokens {
  const category = stackCategory(family);
  const fromStack = family.fallback.find((name) => knownFamily(name) !== undefined);
  const name = family.substitute?.family ?? fromStack ?? DEFAULT_SUBSTITUTE[category];
  const known = knownFamily(name);
  const ownCategory = known?.category ?? category;
  return {
    family: name,
    panose: (family.substitute?.panose ?? known?.panose ?? UNKNOWN_PANOSE).toUpperCase(),
    pitchFamily: family.substitute?.pitchFamily ?? known?.pitchFamily ?? categoryPitch(ownCategory),
    charset: family.substitute?.charset ?? 0,
    category: ownCategory,
  };
}

/**
 * The PANOSE, pitch-and-family and letterform of a family this module knows, matched by its
 * lower-case name, or `undefined` for any other family.
 *
 * @param name - The family name as written.
 */
function knownFamily(name: string): KnownFamily | undefined {
  return ownValue(KNOWN_FAMILIES, name.toLowerCase());
}

/**
 * The pitch-and-family byte of a kind of letterform.
 *
 * @param category - Sans, serif or mono.
 */
function categoryPitch(category: SubstituteTokens['category']): number {
  if (category === 'mono') {
    return MONO_PITCH;
  }

  return category === 'serif' ? SERIF_PITCH : SANS_PITCH;
}
