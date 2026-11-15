import type { SubstituteTokens } from '@deckster/brand';

import type { EmbeddedFamily, FontInstance, ResolvedFont } from '#fonts/font-plan.ts';

import { FONT_SLOTS } from '#fonts/instance-tables.ts';
import { el } from '#ooxml/xml.ts';

/**
 * The child element of `p:embeddedFont` for each face (ECMA-376 Part 1, §19.2.1.9), in schema
 * order.
 */
const SLOT_ELEMENTS = {
  /**
   * `p:regular`.
   */
  regular: 'p:regular',

  /**
   * `p:bold`.
   */
  bold: 'p:bold',

  /**
   * `p:italic`.
   */
  italic: 'p:italic',

  /**
   * `p:boldItalic`.
   */
  boldItalic: 'p:boldItalic',
} as const;

/**
 * The attributes `presentation.xml`'s `p:presentation` gets when fonts are embedded: TrueType fonts
 * are embedded (§19.2.1.26 `embedTrueTypeFonts`) and only the characters used were saved
 * (`saveSubsetFonts`), which tells PowerPoint to keep subsetting when it saves.
 */
export const EMBEDDED_FONT_PRESENTATION_ATTRIBUTES = {
  /**
   * Embed TrueType fonts.
   */
  embedTrueTypeFonts: 1,

  /**
   * The embedded fonts are subsets.
   */
  saveSubsetFonts: 1,
} as const;

/**
 * The `p:embeddedFontLst` of `presentation.xml` (ECMA-376 Part 1, §19.2.1.10): one `p:embeddedFont`
 * per family with `p:font` (typeface, PANOSE, pitch-and-family, charset; §19.2.1.13) and a
 * relationship id per face. In `p:presentation` it goes after `p:notesSz` and before
 * `p:defaultTextStyle` (after `p:smartTags`, before `p:custShowLst`). Empty when nothing is
 * embedded.
 *
 * Each face is a part `ppt/fonts/fontN.fntdata` written with `fntdata` (content type
 * `FONT_DATA_CONTENT_TYPE`), related from `ppt/presentation.xml` with `FONT_RELATIONSHIP`.
 *
 * @param families - The plan's families.
 * @param relationship - The relationship id of an instance's part.
 * @returns The element, or an empty string.
 */
export function embeddedFontListXml(
  families: readonly EmbeddedFamily[],
  relationship: (instance: FontInstance) => string,
): string {
  if (families.length === 0) {
    return '';
  }

  return el(
    'p:embeddedFontLst',
    {},
    ...families.map((family) =>
      el(
        'p:embeddedFont',
        {},
        el('p:font', {
          typeface: family.typeface,
          panose: family.panose,
          pitchFamily: family.pitchFamily,
          charset: family.charset,
        }),
        ...FONT_SLOTS.flatMap((slot) => {
          const instance = family.slots[slot];
          return instance === undefined
            ? []
            : [el(SLOT_ELEMENTS[slot], { 'r:id': relationship(instance) })];
        }),
      ),
    ),
  );
}

/**
 * The attributes of a run's `a:latin` (ECMA-376 Part 1, §21.1.2.3.7): the embedded typeface with
 * its PANOSE, pitch-and-family and charset, so an app that cannot use the embedded font still
 * substitutes a font of the same kind; or, for text the plan does not embed, the substitute.
 *
 * @param font - The resolved font, or `null` to write the substitute.
 * @param substitute - The family's substitute.
 */
export function latinAttributes(
  font: ResolvedFont | null,
  substitute: SubstituteTokens | null,
): Record<string, string | number> {
  if (font !== null) {
    return {
      typeface: font.typeface,
      panose: font.panose,
      pitchFamily: font.pitchFamily,
      charset: font.charset,
    };
  }

  if (substitute === null) {
    return {};
  }

  return {
    typeface: substitute.family,
    panose: substitute.panose,
    pitchFamily: substitute.pitchFamily,
    charset: substitute.charset,
  };
}

/**
 * An `a:latin` element for a font.
 *
 * @param font - The resolved font, or `null` for the substitute.
 * @param substitute - The family's substitute.
 */
export function latinXml(font: ResolvedFont | null, substitute: SubstituteTokens | null): string {
  const attributes = latinAttributes(font, substitute);
  return 'typeface' in attributes ? el('a:latin', attributes) : '';
}
