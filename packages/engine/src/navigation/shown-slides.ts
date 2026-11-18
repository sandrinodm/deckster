import type { DeckManifest } from '#contract/manifest.ts';

/**
 * Which way to look for a neighbouring shown slide.
 */
export type SlideSide = 'forward' | 'backward';

/**
 * Whether each slide of the deck is hidden, in deck order, read from the slides' `hidden:`
 * frontmatter. Pass the result to the other helpers of this file, or build the same list from
 * `window.__deck.slides` with `slides.map((slide) => slide.hidden)`.
 *
 * @param manifest - The deck.
 */
export function hiddenSlides(manifest: DeckManifest): boolean[] {
  return manifest.slides.map((entry) => entry.module.slideMeta.frontmatter.hidden === true);
}

/**
 * The indexes of the slides a talk shows, in order: every slide that is not hidden. A deck whose
 * every slide is hidden has no talk, so all its slides count as shown, which keeps navigation from
 * being trapped by a hand-built manifest (the build rejects such a deck).
 *
 * @param hidden - Whether each slide is hidden, in deck order.
 */
export function shownSlideIndexes(hidden: readonly boolean[]): number[] {
  const shown = hidden.flatMap((isHidden, index) => (isHidden ? [] : [index]));
  if (shown.length === 0) {
    return hidden.map((_, index) => index);
  }

  return shown;
}

/**
 * The nearest shown slide on one side of a slide. The slide itself may be hidden (the deck was sent
 * there with `goto`), and the answer is still the nearest shown slide before or after it.
 *
 * @param hidden - Whether each slide is hidden, in deck order.
 * @param index - The zero-based index to start from.
 * @param side - `forward` looks at later slides, `backward` at earlier ones.
 * @returns The index, or `undefined` when no shown slide lies that way.
 */
export function neighbourShownSlide(
  hidden: readonly boolean[],
  index: number,
  side: SlideSide,
): number | undefined {
  const shown = shownSlideIndexes(hidden);
  if (side === 'forward') {
    return shown.find((candidate) => candidate > index);
  }

  return shown.findLast((candidate) => candidate < index);
}

/**
 * The 1-based page number of a slide among the shown slides, the number an audience sees.
 *
 * @param hidden - Whether each slide is hidden, in deck order.
 * @param index - The zero-based index of the slide.
 * @returns The page number, or `undefined` for a hidden slide, which has none.
 */
export function shownPageNumber(hidden: readonly boolean[], index: number): number | undefined {
  const position = shownSlideIndexes(hidden).indexOf(index);
  return position === -1 ? undefined : position + 1;
}

/**
 * Whether two different slides follow one another in a talk: no shown slide lies between them. Used
 * where a slide pairs with the one before or after it (transitions, morphs). A hidden slide the
 * deck was sent to counts as the neighbour of the shown slides around it.
 *
 * @param hidden - Whether each slide is hidden, in deck order; missing entries count as shown.
 * @param a - One zero-based slide index.
 * @param b - The other zero-based slide index.
 */
export function areShownNeighbours(hidden: readonly boolean[], a: number, b: number): boolean {
  if (a === b) {
    return false;
  }

  // Every slide hidden (or no flags at all) leaves nothing to skip.
  const allShown = hidden.every((isHidden) => isHidden);
  const earlier = Math.min(a, b);
  const later = Math.max(a, b);
  for (let index = earlier + 1; index < later; index += 1) {
    if (allShown || hidden[index] !== true) {
      return false;
    }
  }

  return true;
}
