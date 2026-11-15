import { useReadyHold } from '@deckster/engine';
import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

import {
  lineHeightOf,
  MEASURE_TOLERANCE_PX,
  overflowsBottom,
} from '#foundation/layout-geometry.ts';

/**
 * The scale factors a fitted text steps down through, largest first: four sizes, so long text
 * shrinks in visible steps that repeat from slide to slide instead of to an arbitrary size.
 */
export const FIT_STEPS: readonly number[] = [1, 0.88, 0.78, 0.7];

/**
 * The scale factors a group of figures steps down through: the fit steps, then two more, because a
 * row of four eight-character figures in the stat style needs about half the size to fit.
 */
export const GROUP_FIT_STEPS: readonly number[] = [...FIT_STEPS, 0.62, 0.55];

/**
 * The custom property the kit's type classes multiply their size by.
 */
const FIT_PROPERTY = '--kit-fit';

/**
 * The brand type steps a fitted text can switch to; the element carries the `kit-fitted` class so
 * the step's bundle applies.
 */
export type FitTypeStep = 'display' | 'headline' | 'title' | 'quote';

/**
 * One size a fitted text tries: a scale of its type step (or of another step) and the most lines it
 * may take at that size.
 */
export type FitRung = {
  /**
   * The type step to set the text in; its own class's step when left out.
   */
  step?: FitTypeStep;

  /**
   * The factor the step's size is multiplied by, 1 or less.
   */
  scale: number;

  /**
   * The most lines the text may take at this size, 1 or more.
   */
  maxLines: number;
};

/**
 * How a fitted text ended up, set as its `data-fit` attribute: at its first size, at a later one,
 * or still too long at the last (then clipped to its line budget, which `deck lint` reports as
 * overflow).
 */
export type FitResult = 'natural' | 'stepped' | 'overflow';

/**
 * The ladder for a text that keeps its type step and steps down through {@link FIT_STEPS}.
 *
 * @param maxLines - The most lines at every size.
 * @returns One rung per fit step.
 */
export function fitSteps(maxLines: number): readonly FitRung[] {
  return FIT_STEPS.map((scale) => ({ scale, maxLines }));
}

/**
 * Fits a text element down a ladder of sizes until it takes at most the rung's lines, no word is
 * wider than its box and, when a `boundary` is given, the nearest ancestor matching it has no
 * content below its bottom edge. It runs again whenever the slide re-renders and whenever web fonts
 * finish loading, and holds the deck's `ready()` until the fonts have settled, so screenshots and
 * lint always see the fitted size. Every measurement uses layout geometry, which ignores
 * transforms, so the slide entrance and transitions never change the result.
 *
 * @param ref - The text element; it must use one of the kit's `kit-type-*` classes.
 * @param ladder - The sizes to try, largest first; at least one.
 * @param boundary - A selector for an ancestor the text must leave room in, such as the column of a
 *   cover; `undefined` checks lines and width only.
 */
export function useFitLadder(
  ref: RefObject<HTMLElement | null>,
  ladder: readonly FitRung[],
  boundary?: string,
): void {
  useRenderOnFontLoad();
  // Runs after every render: slot content is a fresh React node each time, and refitting is cheap.
  useLayoutEffect(() => {
    const element = ref.current;
    if (element !== null) {
      fitLadder(element, ladder, boundary);
    }
  });
}

/**
 * Steps a group of single-line elements down together until none is wider than its box, so a row of
 * numbers keeps one size. Like {@link useFitLadder} it refits after renders and font loads.
 *
 * @param ref - The element that contains the group.
 * @param selector - Selects the elements to fit inside it; each must use a `kit-type-*` class and
 *   `white-space: nowrap`.
 */
export function useFitGroupWidth(ref: RefObject<HTMLElement | null>, selector: string): void {
  useRenderOnFontLoad();
  useLayoutEffect(() => {
    const container = ref.current;
    if (container !== null) {
      fitGroupWidth(Array.from(container.querySelectorAll<HTMLElement>(selector)));
    }
  });
}

/**
 * Fits one element down a ladder of sizes and records the outcome in `data-fit`, and the type step
 * it ended on in `data-kit-step` when a rung names one.
 *
 * @param element - The text element.
 * @param ladder - The sizes to try, largest first; an empty ladder leaves the text as it is.
 * @param boundary - A selector for an ancestor that must not overflow; see {@link useFitLadder}.
 * @returns How the text ended up.
 */
export function fitLadder(
  element: HTMLElement,
  ladder: readonly FitRung[],
  boundary?: string,
): FitResult {
  element.style.removeProperty('max-height');
  element.style.removeProperty('overflow');
  const container = boundary === undefined ? null : element.closest<HTMLElement>(boundary);
  for (const [index, rung] of ladder.entries()) {
    applyRung(element, rung);
    const leavesRoom = container === null || !overflowsBottom(container);
    if (lineCount(element) <= rung.maxLines && !isTooWide(element) && leavesRoom) {
      const result = index === 0 ? 'natural' : 'stepped';
      element.dataset['fit'] = result;
      return result;
    }
  }

  // Still too long at the smallest size: clip to the budget so the slide keeps its shape, and let
  // the overflow show up in `deck lint`.
  const last = ladder.at(-1);
  if (last !== undefined) {
    element.style.maxHeight = `${last.maxLines * lineHeightOf(element)}px`;
    element.style.overflow = 'hidden';
  }

  element.dataset['fit'] = 'overflow';
  return 'overflow';
}

/**
 * Fits a group of elements to their widths at one shared scale, down through
 * {@link GROUP_FIT_STEPS}, and records it in `data-fit`.
 *
 * @param elements - The elements, each on one line.
 * @returns How the group ended up; `natural` for an empty group.
 */
export function fitGroupWidth(elements: readonly HTMLElement[]): FitResult {
  for (const [index, scale] of GROUP_FIT_STEPS.entries()) {
    for (const element of elements) {
      element.style.setProperty(FIT_PROPERTY, String(scale));
    }

    if (!elements.some(isTooWide)) {
      return markAll(elements, index === 0 ? 'natural' : 'stepped');
    }
  }

  return markAll(elements, 'overflow');
}

/**
 * Re-renders the calling component each time the document's web fonts finish loading, so measured
 * text is measured again with the real glyphs. Until the first load settles it holds the deck's
 * `ready()`.
 */
export function useRenderOnFontLoad(): void {
  const [, setVersion] = useState(0);
  const [settled, setSettled] = useState(() => documentFonts() === undefined);
  useReadyHold(!settled);
  useEffect(() => {
    const fonts = documentFonts();
    if (fonts === undefined) {
      return undefined;
    }

    let live = true;
    /**
     * Counts a finished font load.
     */
    const bump = () => {
      if (live) {
        setVersion((current) => current + 1);
      }
    };
    fonts.addEventListener('loadingdone', bump);
    void fonts.ready.then(() => {
      if (live) {
        bump();
        setSettled(true);
      }
    });
    return () => {
      live = false;
      fonts.removeEventListener('loadingdone', bump);
    };
  }, []);
}

/**
 * Sets an element to one rung's size: its scale, and its type step when the rung names one.
 *
 * @param element - The text element.
 * @param rung - The size to set.
 */
function applyRung(element: HTMLElement, rung: FitRung): void {
  element.style.setProperty(FIT_PROPERTY, String(rung.scale));
  if (rung.step === undefined) {
    delete element.dataset['kitStep'];
  } else {
    element.dataset['kitStep'] = rung.step;
  }
}

/**
 * The document's font set, or `undefined` where there is none (outside a browser, or in a test DOM
 * without the Font Loading API).
 */
function documentFonts(): FontFaceSet | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }

  // The DOM types declare `fonts` on every document, but test DOMs and old engines lack it.
  const fonts: FontFaceSet | undefined = document.fonts;
  return fonts;
}

/**
 * How many lines an element's text takes, from its layout height and line height. Both are canvas
 * pixels, unaffected by transforms.
 *
 * @param element - The text element.
 */
function lineCount(element: HTMLElement): number {
  return Math.round(element.offsetHeight / lineHeightOf(element));
}

/**
 * Whether the element's content is wider than its box: a word that does not fit on a line.
 *
 * @param element - The text element.
 */
function isTooWide(element: HTMLElement): boolean {
  return element.scrollWidth > element.clientWidth + MEASURE_TOLERANCE_PX;
}

/**
 * Records the same fit result on every element of a group.
 *
 * @param elements - The group.
 * @param result - The outcome.
 */
function markAll(elements: readonly HTMLElement[], result: FitResult): FitResult {
  for (const element of elements) {
    element.dataset['fit'] = result;
  }

  return result;
}
