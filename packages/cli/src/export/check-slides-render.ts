import { deckCommand } from '@deckster/engine/command';
import { Effect } from 'effect';

import type { DeckPage } from '#browser/deck-page.ts';
import type { ExportTarget } from '#export/export-targets.ts';

import {
  cliError,
  firstLine,
  type BrowserError,
  type CliError,
  type SlideNotReadyError,
} from '#cli-error.ts';

/**
 * Shows every target and fails when the page threw while the deck loaded or a slide shows an error
 * in place of its content, the same test `deckster shot` applies to each image. Without it, a
 * layout that fails to load or render is exported as the engine's error panel.
 *
 * The check covers every slide before any is captured, so one run names every broken slide.
 *
 * @param deck - The deck folder name, for the error.
 * @param page - The open deck.
 * @param targets - The slides and steps about to be exported.
 * @throws CliError in the error channel, naming each failed slide with its error, when any slide or
 *   the page threw before the slides were checked; SlideNotReadyError or BrowserError when a slide
 *   does not show.
 */
export const assertSlidesRender = Effect.fn('assertSlidesRender')(function* (
  deck: string,
  page: DeckPage,
  targets: readonly ExportTarget[],
): Effect.fn.Return<void, CliError | SlideNotReadyError | BrowserError> {
  const loadErrors = yield* page.takeErrors();
  const failed = new Map<number, string>();
  for (const target of targets) {
    if (failed.has(target.slide.index)) {
      continue;
    }

    yield* page.show(target.slide.index, target.step);
    const problem = yield* page.renderError();
    const thrown = yield* page.takeErrors();
    const message = problem === null ? thrown[0] : problem.message;
    if (message !== undefined) {
      failed.set(target.slide.index, firstLine(message));
    }
  }

  if (failed.size === 0 && loadErrors.length === 0) {
    return;
  }

  const slides = targets
    .filter(
      (target, position) => targets.findIndex((other) => other.slide === target.slide) === position,
    )
    .filter((target) => failed.has(target.slide.index))
    .map(
      (target) =>
        `  slide ${target.slide.index + 1} "${target.slide.id}": ${failed.get(target.slide.index)}`,
    );
  const loading = loadErrors.map(
    (error) =>
      `  the page threw while the deck loaded or its slides were listed: ${firstLine(error)}`,
  );
  return yield* cliError(
    `Deck "${deck}" was not exported: ${slides.length + loading.length} problem(s) render an error instead of the slide.\n` +
      [...slides, ...loading].join('\n') +
      '\nRun `' +
      deckCommand() +
      ' lint ' +
      deck +
      '` for every problem with its fix.',
  );
});
