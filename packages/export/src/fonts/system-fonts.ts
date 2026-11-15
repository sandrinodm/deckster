import type { BrandTokens } from '@deckster/brand';

/**
 * The weight from which a substitute's bold face is used.
 */
const BOLD_FROM_WEIGHT = 550;

/**
 * Runs of whitespace, which a family name or PostScript name drops.
 */
const WHITESPACE_RUN = /\s+/g;

/**
 * The CSS that re-renders a deck in its brand's substitutes, for `deck export --fonts system`: the
 * slides are measured, and their lines broken, as Keynote, Google Slides or PowerPoint without the
 * brand fonts will set them.
 *
 * For every brand family it declares four `@font-face` rules under the brand family's own name
 * whose sources are the substitute's installed faces (`local("Arial")`, `local("Arial Bold")`,
 * `local("Arial Italic")`, `local("Arial Bold Italic")` and their PostScript names), weights below
 * 550 regular and from 550 bold, any width, no `unicode-range`. Added after the brand's own
 * stylesheet they win the font matching for every character, so everything that names the brand
 * family (type steps, `--brand-font-*`, SVG text in charts and diagrams) draws in the substitute
 * while computed `font-family` values stay the brand's. It also sets `font-variation-settings:
 * normal` and `font-optical-sizing: none` everywhere, since substitutes have no axes. Add it with
 * `page.addStyleTag({ content })` and wait for `document.fonts.ready` before measuring.
 *
 * @param brand - The resolved brand.
 * @returns CSS text.
 */
export function systemFontsStyle(brand: BrandTokens): string {
  const families = new Map(
    Object.values(brand.typography.families).map((family) => [family.family, family.substitute]),
  );
  const rules = [...families.entries()].flatMap(([family, substitute]) =>
    [false, true].flatMap((italic) =>
      [false, true].map((bold) => faceRule(family, substitute.family, { italic, bold })),
    ),
  );
  return [
    ...rules,
    '*, *::before, *::after {',
    '  font-variation-settings: normal !important;',
    '  font-optical-sizing: none !important;',
    '}',
  ].join('\n');
}

/**
 * The bold and italic flags of one face of a family.
 */
type FaceStyle = {
  /**
   * Whether the face is italic.
   */
  italic: boolean;

  /**
   * Whether the face is bold.
   */
  bold: boolean;
};

/**
 * The `@font-face` rule for one face of a brand family: the substitute's installed face of the same
 * style, found by its full name and by its PostScript name (with and without `MT`).
 *
 * @param family - The brand family's name, which the rule declares.
 * @param substitute - The substitute family's installed name.
 * @param face - The face's style.
 */
function faceRule(family: string, substitute: string, face: FaceStyle): string {
  const { italic, bold } = face;
  const styleName = `${bold ? 'Bold' : ''}${bold && italic ? ' ' : ''}${italic ? 'Italic' : ''}`;
  const name = styleName === '' ? substitute : `${substitute} ${styleName}`;
  const compact = substitute.replace(WHITESPACE_RUN, '');
  const postscript =
    styleName === '' ? compact : `${compact}-${styleName.replace(WHITESPACE_RUN, '')}`;
  const sources = [name, postscript, `${postscript}MT`].map(
    (local) => `local(${JSON.stringify(local)})`,
  );
  return [
    '@font-face {',
    `  font-family: ${JSON.stringify(family)};`,
    `  src: ${sources.join(', ')};`,
    `  font-weight: ${bold ? `${BOLD_FROM_WEIGHT} 1000` : `1 ${BOLD_FROM_WEIGHT - 1}`};`,
    `  font-style: ${italic ? 'italic' : 'normal'};`,
    '  font-stretch: 50% 200%;',
    '}',
  ].join('\n');
}
