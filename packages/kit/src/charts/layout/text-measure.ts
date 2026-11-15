/**
 * The type a chart sets one kind of text in, from a brand type step.
 */
export type TextStyle = {
  /**
   * The brand type step, such as `caption`, for the `kit-type-<step>` class.
   */
  step: string;

  /**
   * The CSS `font-family` stack.
   */
  family: string;

  /**
   * The font size in canvas pixels.
   */
  size: number;

  /**
   * The font weight.
   */
  weight: number;

  /**
   * The tracking in em.
   */
  tracking: number;

  /**
   * Whether the step sets text in capitals.
   */
  upper: boolean;

  /**
   * The line height as a multiple of the size.
   */
  lineHeight: number;

  /**
   * Whether numbers use tabular lining figures, as the SVG axis labels do.
   */
  tabular?: boolean;
};

/**
 * Measures how wide a text is in a style, in canvas pixels.
 */
export type Measure = (text: string, style: TextStyle) => number;

/**
 * Bold weight for emphasized chart text (highlighted values, totals).
 */
export const EMPHASIS_WEIGHT = 650;

/**
 * The average width of a character in ems, for estimating a width without a canvas.
 */
const AVERAGE_CHAR_EM = 0.55;

/**
 * Runs of whitespace that separate the words of a text.
 */
const WHITESPACE = /\s+/u;

/**
 * The mark that ends a line which words were left out of.
 */
const ELLIPSIS = '…';

/**
 * Namespace for the SVG text used to measure OpenType tabular figures.
 */
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * The CSS `font` shorthand for a style, as a canvas context and `document.fonts.load` read it.
 *
 * @param style - The text style.
 */
export function fontShorthand(style: TextStyle): string {
  return `${style.weight} ${style.size}px ${style.family}`;
}

/**
 * A measurer backed by a 2D canvas, with the text cased as the step sets it and the step's tracking
 * added per character. Negative tracking is added between characters only: the browser pulls the
 * line's end in after the last one too, but that glyph's ink still reaches its full advance, so
 * counting it would measure tightly tracked text (a large stat) narrower than it draws. Results are
 * cached per font, numeric variant and text. Tabular figures are measured in SVG because canvas
 * does not expose `font-variant-numeric`, and a proportional zero can have a different advance.
 *
 * @returns The measurer; one that estimates from the font size when no canvas is available (in
 *   tests or on the server).
 */
export function canvasMeasure(): Measure {
  const context =
    typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  const cache = new Map<string, number>();
  return (text, style) => {
    const shown = style.upper ? text.toUpperCase() : text;
    const font = fontShorthand(style);
    const key = `${font}|${style.tracking}|${style.tabular === true}|${shown}`;
    const cached = cache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    let width = estimateWidth(shown, style);
    if (context !== null) {
      context.font = font;
      const advance =
        style.tabular === true ? tabularAdvance(shown, style) : context.measureText(shown).width;
      width = advance + style.tracking * style.size * trackedGaps(shown, style);
    }

    cache.set(key, width);
    return width;
  };
}

/**
 * Measures tabular lining figures with the same shaping engine as the chart's SVG labels. The
 * hidden node is attached only for this measurement and removed even if measurement fails.
 *
 * @param text - The text with its case already applied.
 * @param style - The font; tracking is added by the caller.
 */
function tabularAdvance(text: string, style: TextStyle): number {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:fixed;width:0;height:0;visibility:hidden;';
  const label = document.createElementNS(SVG_NAMESPACE, 'text');
  label.style.font = fontShorthand(style);
  label.style.fontVariantNumeric = 'tabular-nums lining-nums';
  label.textContent = text;
  svg.append(label);
  document.body.append(svg);
  try {
    return label.getComputedTextLength();
  } finally {
    svg.remove();
  }
}

/**
 * How many times a text's tracking widens it: once per character when it is positive (the space
 * after the last character is part of the box), once between characters when it is negative.
 *
 * @param text - The text as shown.
 * @param style - The style.
 */
export function trackedGaps(text: string, style: TextStyle): number {
  const characters = Array.from(text).length;
  return style.tracking < 0 ? Math.max(characters - 1, 0) : characters;
}

/**
 * A rough width for a text: about half an em per character, for measuring without a canvas.
 *
 * @param text - The text as shown.
 * @param style - The style.
 */
export function estimateWidth(text: string, style: TextStyle): number {
  return text.length * style.size * (AVERAGE_CHAR_EM + style.tracking);
}

/**
 * The height of one line of a style.
 *
 * @param style - The style.
 */
export function lineHeight(style: TextStyle): number {
  return style.size * style.lineHeight;
}

/**
 * A text broken into lines, and whether words were left out to keep to the line limit.
 */
export type WrappedText = {
  /**
   * The lines; the last ends with an ellipsis when the text was cut.
   */
  lines: string[];

  /**
   * Whether words were left out: the text did not fit in the lines it was allowed.
   */
  cut: boolean;
};

/**
 * Breaks a text into lines no wider than `maxWidth`, at spaces, keeping at most `maxLines`; the
 * last line ends with an ellipsis when words are left over. A word wider than the line stays whole
 * on its own line.
 *
 * @param text - The text.
 * @param maxWidth - The widest a line may be.
 * @param options - The measurer, the style and the most lines.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  options: { measure: Measure; style: TextStyle; maxLines: number },
): string[] {
  return wrapLines(text, maxWidth, options).lines;
}

/**
 * Like {@link wrapText}, and says whether the text was cut, so a chart that has to cut a label can
 * mark it for `deck lint` (a text item's `cut`, written as `data-truncated`) instead of truncating
 * it silently.
 *
 * @param text - The text.
 * @param maxWidth - The widest a line may be.
 * @param options - The measurer, the style and the most lines.
 */
export function wrapLines(
  text: string,
  maxWidth: number,
  options: { measure: Measure; style: TextStyle; maxLines: number },
): WrappedText {
  const { measure, style, maxLines } = options;
  const words = text.split(WHITESPACE).filter((word) => word !== '');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current === '' ? word : `${current} ${word}`;
    if (current === '' || measure(candidate, style) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (lines.length === maxLines - 1) {
      lines.push(withEllipsis(current, maxWidth, measure, style));
      return { lines, cut: true };
    }

    lines.push(current);
    current = word;
  }

  if (current !== '') {
    lines.push(current);
  }

  return { lines, cut: false };
}

/**
 * A line ended with an ellipsis, dropping words from its end until the ellipsis fits in the width
 * too; a single word keeps its ellipsis even when it does not fit.
 *
 * @param line - The words that fit the line.
 * @param maxWidth - The widest the line may be.
 * @param measure - The measurer.
 * @param style - The style.
 */
function withEllipsis(line: string, maxWidth: number, measure: Measure, style: TextStyle): string {
  let words = line.split(' ');
  while (words.length > 1 && measure(`${words.join(' ')}${ELLIPSIS}`, style) > maxWidth) {
    words = words.slice(0, -1);
  }

  return `${words.join(' ')}${ELLIPSIS}`;
}

/**
 * The widest line of a wrapped text.
 *
 * @param lines - The lines.
 * @param measure - The measurer.
 * @param style - The style they are set in.
 */
export function widestLine(lines: readonly string[], measure: Measure, style: TextStyle): number {
  return maxOf(
    lines.map((line) => measure(line, style)),
    0,
  );
}
import { maxOf } from '#foundation/lists.ts';
