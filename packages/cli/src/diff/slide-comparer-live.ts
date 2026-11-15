import type { Page } from 'playwright';

import { compareImages, drawComparison } from '@deckster/export';
import { Effect, type Scope } from 'effect';

import type { SlideComparison } from '#diff/slide-comparer.ts';

import { launchBrowser } from '#browser/deck-browser-live.ts';
import { browserError, cliError, type BrowserError, type CliError } from '#cli-error.ts';

/**
 * Launches Chromium and opens one blank page to decode and draw pictures in; both close when the
 * scope does.
 */
export const openBlankPage = Effect.fn('openBlankPage')(function* (): Effect.fn.Return<
  Page,
  CliError | BrowserError,
  Scope.Scope
> {
  const browser = yield* Effect.acquireRelease(launchBrowser(), (opened) =>
    Effect.promise(() => opened.close()),
  );
  return yield* Effect.tryPromise({
    try: () => browser.newPage(),
    catch: (cause) => browserError('open a comparison page', cause),
  });
});

/**
 * Measures how much two pictures differ.
 *
 * @param page - The blank page that decodes them.
 * @param before - The first PNG.
 * @param after - The second PNG.
 */
export const compare = Effect.fn('compare')(function* (
  page: Page,
  before: Uint8Array,
  after: Uint8Array,
): Effect.fn.Return<SlideComparison, CliError | BrowserError> {
  const comparison = yield* compareImages(page, before, after, []).pipe(
    Effect.mapError((error) => cliError(error.message)),
  );
  return { differenceRatio: comparison.changedShare };
});

/**
 * Draws the side-by-side picture: before, after and the difference highlighted.
 *
 * @param page - The blank page that draws it.
 * @param before - The first PNG.
 * @param after - The second PNG.
 */
export const draw = Effect.fn('draw')(function* (
  page: Page,
  before: Uint8Array,
  after: Uint8Array,
): Effect.fn.Return<Uint8Array, CliError | BrowserError> {
  const pictures = yield* drawComparison(page, before, after, ['before', 'after'], []).pipe(
    Effect.mapError((error) => cliError(error.message)),
  );
  return pictures.sideBySide;
});
