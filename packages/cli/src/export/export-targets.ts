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
 * @returns The targets in deck order.
 * @throws CliError in the error channel for a bad selection; SlideNotReadyError or BrowserError
 *   when a slide does not mount.
 */
export const exportTargets = Effect.fn('exportTargets')(function* (
  page: DeckPage,
  selection: string | undefined,
  steps: boolean,
): Effect.fn.Return<ExportTarget[], CliError | SlideNotReadyError | BrowserError> {
  const slides = yield* selectSlides(page.slides, selection);
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
 * The selected slides.
 *
 * @param slides - The deck's slides.
 * @param selection - The `--slides` value, or `undefined`.
 * @throws CliError in the error channel for a bad selection.
 */
export const selectSlides = Effect.fn('selectSlides')(function* (
  slides: readonly PageSlide[],
  selection: string | undefined,
): Effect.fn.Return<PageSlide[], CliError> {
  if (selection === undefined) {
    return [...slides];
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
