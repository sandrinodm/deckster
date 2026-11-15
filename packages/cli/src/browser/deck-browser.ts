import { Context, Effect, Layer, Scope } from 'effect';

import type { DeckPage } from '#browser/deck-page.ts';

import { cliError, type BrowserError, type CliError } from '#cli-error.ts';

/**
 * How a deck is opened.
 */
export type OpenDeckPageOptions = {
  /**
   * Pixel density; screenshots are `1920 * scale` pixels wide.
   */
  scale: number;

  /**
   * The workspace root, so a deck that fails to start names its files relative to it.
   */
  workspaceRoot?: string;
};

/**
 * Opens decks in headless Chromium. The live layer launches one browser the first time a page is
 * opened, shares it between pages and closes it when the layer's scope closes; commands that never
 * open a page never start Chromium. Tests replace it with pages that return prepared snapshots.
 */
export class DeckBrowser extends Context.Service<
  DeckBrowser,
  {
    /**
     * Opens a deck in a fresh page sized to the canvas (1920x1080), in `?static` mode with reduced
     * motion, and waits until the deck's automation API is ready, failing early with the error when
     * the page breaks before the deck mounts. The page closes when the caller's scope closes.
     *
     * @throws CliError in the error channel when Chromium is not installed or the deck does not
     *   start; BrowserError when Chromium fails.
     */
    readonly open: (
      url: string,
      options: OpenDeckPageOptions,
    ) => Effect.Effect<DeckPage, CliError | BrowserError, Scope.Scope>;
  }
>()('cli/DeckBrowser') {
  /**
   * Headless Chromium through Playwright, launched on first use.
   */
  static readonly layer = Layer.effect(
    DeckBrowser,
    Effect.gen(function* () {
      const layerScope = yield* Effect.scope;
      const browser = yield* Effect.cached(
        loadLive().pipe(
          Effect.flatMap((live) => live.acquireBrowser()),
          Scope.provide(layerScope),
        ),
      );
      return DeckBrowser.of({
        open: Effect.fn('DeckBrowser.open')(function* (url, options) {
          const opened = yield* browser;
          const live = yield* loadLive();
          return yield* live.openDeckPage(opened, url, options);
        }),
      });
    }),
  );
}

/**
 * Loads the module that drives Chromium, the first time a page is wanted: importing Playwright
 * takes a few hundred milliseconds that commands that never open a page do not pay.
 *
 * @throws CliError in the error channel when the module does not load.
 */
const loadLive = Effect.fn('DeckBrowser.loadLive')(function* (): Effect.fn.Return<
  typeof import('#browser/deck-browser-live.ts'),
  CliError
> {
  return yield* Effect.tryPromise({
    try: () => import('#browser/deck-browser-live.ts'),
    catch: (cause) =>
      cliError(
        `Could not load the browser driver: ${cause instanceof Error ? cause.message : String(cause)}`,
      ),
  });
});
