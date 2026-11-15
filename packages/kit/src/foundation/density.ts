import { useLayoutEffect, type RefObject } from 'react';

import { useRenderOnFontLoad } from '#foundation/fit-text.ts';
import { MEASURE_TOLERANCE_PX, ownLineCount } from '#foundation/layout-geometry.ts';

/**
 * The type steps running text can be set in, smallest first. A slot steps up through them when its
 * content is sparse: the reverse of a title stepping down when it is long.
 */
export type TextStep = 'body' | 'lead' | 'title';

/**
 * How full a region may be at a larger step: content that would take more than this share of the
 * height of the region stays at the smaller step, so a stepped-up slide still has air at the
 * bottom.
 */
const MAX_FILL = 0.92;

/**
 * Selects the text blocks whose lines are counted against the line budget.
 */
const TEXT_BLOCKS = 'p, li, h3, blockquote, td, th';

/**
 * What {@link useDensity} measures and how far it may step up.
 */
export type DensityOptions = {
  /**
   * The region the content must fit in: its height is the room available.
   */
  region: RefObject<HTMLElement | null>;

  /**
   * The element that must fit, such as the grid of body and aside; it must not stretch to the
   * height of its region.
   */
  content: RefObject<HTMLElement | null>;

  /**
   * The running text whose `data-text` step is chosen.
   */
  prose: RefObject<HTMLElement | null>;

  /**
   * The steps to try, smallest first; the first is used whenever no larger one fits.
   */
  steps: readonly TextStep[];

  /**
   * The most lines the prose may take at a larger step: the slot's line budget, so stepping up
   * never breaks it.
   */
  maxLines: number;
};

/**
 * Sets running text one or two type steps larger when the slot is sparse: it tries the largest step
 * first and keeps the first at which the content takes at most {@link MAX_FILL} of the region's
 * height, at most `maxLines` lines and no word is wider than its column. Dense content stays at the
 * first step. It measures again after every render and font load with layout geometry, so live
 * navigation and static renders pick the same step.
 *
 * @param options - The region, the content, the prose and the steps.
 */
export function useDensity({ region, content, prose, steps, maxLines }: DensityOptions): void {
  useRenderOnFontLoad();
  useLayoutEffect(() => {
    const box = region.current;
    const fitted = content.current;
    const text = prose.current;
    if (box !== null && fitted !== null && text !== null) {
      chooseStep({ box, fitted, text }, steps, maxLines);
    }
  });
}

/**
 * Sets the running text to the largest step at which the content fits the region, trying the
 * largest first; the smallest when none fits.
 *
 * @param elements - The region, the content that must fit and the running text.
 * @param steps - The steps to try, smallest first.
 * @param maxLines - The line budget.
 */
function chooseStep(
  elements: { box: HTMLElement; fitted: HTMLElement; text: HTMLElement },
  steps: readonly TextStep[],
  maxLines: number,
): void {
  const { box, fitted, text } = elements;
  const room = box.clientHeight * MAX_FILL;
  for (const step of steps.toReversed()) {
    text.dataset['text'] = step;
    if (step === steps[0] || fits(fitted, text, room, maxLines)) {
      return;
    }
  }
}

/**
 * Whether the content fits at the step its prose is set in.
 *
 * @param content - The element that must fit.
 * @param prose - The running text.
 * @param room - The height available, in canvas pixels.
 * @param maxLines - The line budget.
 */
function fits(content: HTMLElement, prose: HTMLElement, room: number, maxLines: number): boolean {
  if (content.offsetHeight > room) {
    return false;
  }

  if (prose.scrollWidth > prose.clientWidth + MEASURE_TOLERANCE_PX) {
    return false;
  }

  let lines = 0;
  for (const block of prose.querySelectorAll<HTMLElement>(TEXT_BLOCKS)) {
    // A loose list item holds paragraphs, which are counted themselves.
    if (block.querySelector('p') === null) {
      lines += ownLineCount(block);
    }
  }

  return lines <= maxLines;
}
