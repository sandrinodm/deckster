import type { Box, ElementSnapshot, StepSnapshot } from '#lint/types.ts';

import { GLYPH_BAND_RATIO, MIN_VISIBLE_OPACITY } from '#lint/limits.ts';

/**
 * `position` values that take an element out of the flow, so it neither pushes nor is pushed by its
 * siblings.
 */
const OUT_OF_FLOW_POSITIONS = new Set(['absolute', 'fixed']);

/**
 * `overflow` values that clip content instead of letting it spill out.
 */
export const CLIPPING_VALUES = new Set(['hidden', 'clip', 'auto', 'scroll']);

/**
 * The elements that count as decoration, which the overflow and text rules skip: those the author
 * marked (`aria-hidden="true"` or `data-decorative` on them or an ancestor), and absolutely or
 * fixed positioned elements with no text, media or placed elements (`data-placed`) inside them,
 * such as background shapes, with everything inside those.
 *
 * @param snapshot - The measured slide.
 * @returns The indexes of the decorative elements.
 */
export function decorativeElements(snapshot: StepSnapshot): ReadonlySet<number> {
  const elements = snapshot.elements;
  const hasContent = elements.map(
    (element) => element.text !== '' || element.isMedia || element.data['placed'] !== undefined,
  );
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const parent = elements[index]?.parent;
    if (parent !== null && parent !== undefined && hasContent[index] === true) {
      hasContent[parent] = true;
    }
  }

  const decorative = new Set<number>();
  for (const element of elements) {
    const isEmptyShape =
      element.data['placed'] === undefined &&
      OUT_OF_FLOW_POSITIONS.has(element.position) &&
      hasContent[element.index] !== true;
    const inDecorative = element.parent !== null && decorative.has(element.parent);
    if (element.decorative || isEmptyShape || inDecorative) {
      decorative.add(element.index);
    }
  }

  return decorative;
}

/**
 * The text elements a reader sees: with their own text, not decoration and not transparent.
 *
 * @param snapshot - The measured slide.
 */
export function visibleTextElements(snapshot: StepSnapshot): ElementSnapshot[] {
  const decorative = decorativeElements(snapshot);
  return snapshot.elements.filter(
    (element) =>
      element.text !== '' &&
      !decorative.has(element.index) &&
      element.opacity >= MIN_VISIBLE_OPACITY,
  );
}

/**
 * The indexes of an element's recorded ancestors, nearest first.
 *
 * @param element - A measured element.
 * @param snapshot - The slide's elements, to walk up through.
 */
export function ancestorsOf(element: ElementSnapshot, snapshot: StepSnapshot): number[] {
  const found: number[] = [];
  let parent = element.parent;
  while (parent !== null) {
    found.push(parent);
    parent = snapshot.elements[parent]?.parent ?? null;
  }

  return found;
}

/**
 * The line boxes of an element's own text: each text fragment with its height set to the line
 * height, centered as the browser centers it. A font is usually taller than a tight line height
 * (headings at 0.95); the glyphs above and below the line box are not content that overflows.
 *
 * @param element - A measured element.
 */
export function lineBoxes(element: ElementSnapshot): Box[] {
  const { lineHeightPx, fontSizePx, renderedFontSizePx } = element;
  if (lineHeightPx === null || fontSizePx === 0) {
    return [...element.textLines];
  }

  const height = lineHeightPx * (renderedFontSizePx / fontSizePx);
  return element.textLines.map((line) => ({
    x: line.x,
    y: line.y + line.height / 2 - height / 2,
    width: line.width,
    height,
  }));
}

/**
 * The band of each line of an element's own text where its glyphs are, for overlap checks.
 *
 * @param element - A measured element.
 */
export function glyphBands(element: ElementSnapshot): Box[] {
  const height = element.renderedFontSizePx * GLYPH_BAND_RATIO;
  return element.textLines.map((line) => ({
    x: line.x,
    y: line.y + line.height / 2 - height / 2,
    width: line.width,
    height: Math.min(height, line.height),
  }));
}

/**
 * How far two boxes overlap across and down; negative when they are apart in that direction.
 *
 * @param a - A box.
 * @param b - Another box.
 */
export function overlapOf(a: Box, b: Box): { width: number; height: number } {
  return {
    width: Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
    height: Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
  };
}
