import type { LoadedDeck } from '@deckster/vite-plugin';

import { Effect } from 'effect';

import type { LintFinding } from '#lint/types.ts';
import type { RunningDeckServer } from '#server/deck-server.ts';

import { findingsFromBuildWarnings } from '#lint/build-warnings.ts';
import { findingsFromError, type DeckPlace } from '#lint/deck-problems.ts';

/**
 * What compiling every slide found.
 */
export type SlideFileChecks = {
  /**
   * What the pipeline rejected: the deck cannot render until they are fixed.
   */
  problems: LintFinding[];

  /**
   * What the MDX extensions warned about, such as a missing image, with each warning's rule id.
   */
  warnings: LintFinding[];
};

/**
 * Compiles every slide through the deck's own Vite pipeline and collects what it rejects:
 * frontmatter that fails its schema, unknown keys, MDX that does not compile. This is the same code
 * path as `deck build`, run per file so one run reports every bad file. It also collects what the
 * MDX extensions warn about, which the build only prints.
 *
 * @param server - A running deck server.
 * @param deck - The loaded deck.
 * @param place - The deck's location, for file names in findings.
 */
export const checkSlideFiles = Effect.fn('checkSlideFiles')(function* (
  server: RunningDeckServer,
  deck: LoadedDeck,
  place: DeckPlace,
): Effect.fn.Return<SlideFileChecks> {
  const perSlide = yield* Effect.forEach(deck.slides, (slide) =>
    server.compile(slide.file).pipe(
      Effect.match({
        onSuccess: (warnings): SlideFileChecks => ({
          problems: [],
          warnings: findingsFromBuildWarnings(warnings, slide, place),
        }),
        onFailure: (error): SlideFileChecks => ({
          problems: findingsFromError(error.cause, place),
          warnings: [],
        }),
      }),
    ),
  );
  return {
    problems: perSlide.flatMap((checks) => checks.problems),
    warnings: perSlide.flatMap((checks) => checks.warnings),
  };
});
