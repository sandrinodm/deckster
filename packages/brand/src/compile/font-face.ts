import { cssAtRule, cssNumber, cssString, cssUnicodeRange, cssUrl } from '#compile/css-syntax.ts';
import { ownValue } from '#resolve/own-value.ts';

/**
 * `swap` shows fallback text at once; screenshots wait for `document.fonts.ready` anyway.
 */
const FONT_DISPLAY = 'swap';

/**
 * The CSS `format()` name of each font file extension.
 */
const FORMATS: Readonly<Record<string, string>> = {
  /**
   * WOFF 2, what Fontsource ships.
   */
  woff2: 'woff2',

  /**
   * WOFF 1.
   */
  woff: 'woff',

  /**
   * TrueType.
   */
  ttf: 'truetype',

  /**
   * OpenType with CFF outlines.
   */
  otf: 'opentype',
};

/**
 * The extension at the end of a file path or URL.
 */
const EXTENSION_PATTERN = /\.([a-z0-9]+)$/i;

/**
 * One `@font-face` rule: a file and the family, weights, style and characters it covers.
 */
export type FontFaceRule = {
  /**
   * The family name the rule declares, unquoted.
   */
  family: string;

  /**
   * Where the browser loads the file from; the build rewrites file paths into asset URLs.
   */
  url: string;

  /**
   * A single weight such as `400`, or a variable range such as `[100, 900]`.
   */
  weight: number | readonly [number, number];

  /**
   * The style the file draws.
   */
  style: 'normal' | 'italic';

  /**
   * The CSS `unicode-range` the file covers, or `undefined` for every character.
   */
  unicodeRange: string | undefined;
};

/**
 * Writes `@font-face` rules.
 *
 * @param faces - The faces to declare, in the order the browser should consider them.
 * @returns CSS, empty when there are no faces.
 */
export function fontFaceCss(faces: readonly FontFaceRule[]): string {
  return faces.map(fontFace).join('\n\n');
}

/**
 * One `@font-face` rule. The format comes from the URL's extension; a URL without one is treated as
 * WOFF 2, and an unknown extension is passed through as the format name.
 *
 * @param face - The face to declare.
 */
function fontFace(face: FontFaceRule): string {
  const weight =
    typeof face.weight === 'number' ? cssNumber(face.weight) : face.weight.map(cssNumber).join(' ');
  const extension = EXTENSION_PATTERN.exec(face.url)?.[1]?.toLowerCase() ?? 'woff2';
  const format = ownValue(FORMATS, extension) ?? extension;
  return cssAtRule('@font-face', [
    ['font-family', cssString(face.family)],
    ['src', `${cssUrl(face.url)} format(${cssString(format)})`],
    ['font-weight', weight],
    ['font-style', face.style === 'italic' ? 'italic' : 'normal'],
    ['font-display', FONT_DISPLAY],
    ...(face.unicodeRange === undefined
      ? []
      : [['unicode-range', cssUnicodeRange(face.unicodeRange)] as const]),
  ]);
}
