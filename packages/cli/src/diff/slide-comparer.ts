import { Context, Effect, Layer, Scope } from 'effect';

import { cliError, type BrowserError, type CliError } from '#cli-error.ts';

/**
 * Two pictures of one slide, compared.
 */
export type SlideComparison = {
  /**
   * The share of pixels that differ visibly (a mean channel difference above a tenth of full scale,
   * which ignores anti-aliasing), from 0 to 1, measured at half the canvas size.
   */
  differenceRatio: number;
};

/**
 * Compares two PNGs of the same slide. The live layer reuses the comparison `deckster export
 * --verify` runs: both pictures are decoded and diffed in a blank Chromium page, so no image
 * library is needed. Tests replace it with a comparison of bytes.
 */
export class SlideComparer extends Context.Service<
  SlideComparer,
  {
    /**
     * Measures how much two pictures differ.
     *
     * @throws CliError in the error channel when a picture does not decode or Chromium is not
     *   installed; BrowserError when Chromium fails.
     */
    readonly compare: (
      before: Uint8Array,
      after: Uint8Array,
    ) => Effect.Effect<SlideComparison, CliError | BrowserError>;

    /**
     * Draws the side-by-side picture: before, after and the difference highlighted.
     *
     * @throws CliError in the error channel when a picture does not decode or Chromium is not
     *   installed; BrowserError when Chromium fails.
     */
    readonly draw: (
      before: Uint8Array,
      after: Uint8Array,
    ) => Effect.Effect<Uint8Array, CliError | BrowserError>;
  }
>()('cli/SlideComparer') {
  /**
   * Comparison in headless Chromium, launched on first use and closed with the layer's scope.
   */
  static readonly layer = Layer.effect(
    SlideComparer,
    Effect.gen(function* () {
      const layerScope = yield* Effect.scope;
      const blank = yield* Effect.cached(
        loadLive().pipe(
          Effect.flatMap((live) => live.openBlankPage()),
          Scope.provide(layerScope),
        ),
      );
      return SlideComparer.of({
        compare: Effect.fn('SlideComparer.compare')(function* (before, after) {
          const page = yield* blank;
          const live = yield* loadLive();
          return yield* live.compare(page, before, after);
        }),
        draw: Effect.fn('SlideComparer.draw')(function* (before, after) {
          const page = yield* blank;
          const live = yield* loadLive();
          return yield* live.draw(page, before, after);
        }),
      });
    }),
  );
}

/**
 * Loads the module that compares pictures in Chromium, the first time two are compared.
 *
 * @throws CliError in the error channel when the module does not load.
 */
const loadLive = Effect.fn('SlideComparer.loadLive')(function* (): Effect.fn.Return<
  typeof import('#diff/slide-comparer-live.ts'),
  CliError
> {
  return yield* Effect.tryPromise({
    try: () => import('#diff/slide-comparer-live.ts'),
    catch: (cause) =>
      cliError(
        `Could not load the picture comparer: ${cause instanceof Error ? cause.message : String(cause)}`,
      ),
  });
});
