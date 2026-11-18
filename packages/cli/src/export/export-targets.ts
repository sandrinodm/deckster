import { parseSlideSelection } from '@deckster/export';
import { Effect } from 'effect';

import type { DeckPage, PageSlide } from '#browser/deck-page.ts';

import {
  usageError,
  type BrowserError,
  type CliError,
  type SlideNotReadyError,
} from '#cli-error.ts';

/**
 * One exported page or slide: a deck slide at one step.
 */
export type ExportTarget = {
  /**
   * The slide.
   */
  slide: PageSlide;

  /**
   * The step to show.
   */
  step: number;

  /**
   * The step for file names and reports, or `null` for "the finished slide" (without `--steps`).
   */
  stepLabel: number | null;
};

/**
 * The slides and steps to export: every selected slide at its last step, or at every step with
 * `steps`.
 *
 * @param page - The open deck.
 * @param selection - The `--slides` value, or `undefined` for every slide.
 * @param steps - Whether to export every step.
 * @param includeHidden - Whether hidden slides are exported without being named.
 * @returns The targets in deck order.
 * @throws CliError in the error channel for a bad selection; SlideNotReadyError or BrowserError
 *   when a slide does not mount.
 */
export const exportTargets = Effect.fn('exportTargets')(function* (
  page: DeckPage,
  selection: string | undefined,
  steps: boolean,
  includeHidden: boolean,
): Effect.fn.Return<ExportTarget[], CliError | SlideNotReadyError | BrowserError> {
  const slides = yield* selectSlides(page.slides, selection, includeHidden);
  const targets: ExportTarget[] = [];
  for (const slide of slides) {
    const count = yield* page.stepCount(slide.index);
    if (steps) {
      for (let step = 0; step < count; step += 1) {
        targets.push({ slide, step, stepLabel: step });
      }
    } else {
      targets.push({ slide, step: count - 1, stepLabel: null });
    }
  }

  return targets;
});

/**
 * The selected slides. Without a selection every slide that is not hidden is selected (all of them
 * with `includeHidden`); a selection is an explicit choice, so it keeps a hidden slide it names,
 * also inside a range.
 *
 * @param slides - The deck's slides.
 * @param selection - The `--slides` value, or `undefined`.
 * @param includeHidden - Whether hidden slides are selected without being named.
 * @throws CliError in the error channel for a bad selection.
 */
export const selectSlides = Effect.fn('selectSlides')(function* (
  slides: readonly PageSlide[],
  selection: string | undefined,
  includeHidden: boolean,
): Effect.fn.Return<PageSlide[], CliError> {
  if (selection === undefined) {
    return includeHidden ? [...slides] : slides.filter((slide) => !slide.hidden);
  }

  const parsed = parseSlideSelection(
    selection,
    slides.map((slide) => slide.id),
  );
  if (!parsed.ok) {
    return yield* usageError(`--slides: ${parsed.message}`, 'export');
  }

  return parsed.indexes.flatMap((index) => {
    const slide = slides[index];
    return slide === undefined ? [] : [slide];
  });
});

/**
 * How many hidden slides an export leaves out because nothing asked for them: all of the deck's
 * hidden slides when there is no `--slides` and no `--include-hidden`, else none (a selection
 * leaves slides out by its own choice).
 *
 * @param slides - The deck's slides.
 * @param selection - The `--slides` value, or `undefined`.
 * @param includeHidden - Whether `--include-hidden` was given.
 */
export function hiddenLeftOut(
  slides: readonly PageSlide[],
  selection: string | undefined,
  includeHidden: boolean,
): number {
  if (selection !== undefined || includeHidden) {
    return 0;
  }

  return slides.filter((slide) => slide.hidden).length;
}
