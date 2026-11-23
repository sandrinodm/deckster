import type { MdxWarning } from '@deckster/vite-plugin';

import { Context, Effect, Layer, type Scope } from 'effect';

import { ViteError } from '#cli-error.ts';
import { Workspace } from '#workspace.ts';

/**
 * Which deck to serve, and in which brand.
 */
export type DeckServerOptions = {
  /**
   * The deck folder name under `decks/`.
   */
  deck: string;

  /**
   * A brand folder under `brands/` that replaces the deck config's `brand`; `undefined` keeps it.
   */
  brand: string | undefined;

  /**
   * Serve the deck from this workspace instead of the layer's, such as a checkout of an older
   * revision; leave it out for the layer's own.
   */
  workspaceRoot?: string;
};

/**
 * A running server for one deck, for tools that load or screenshot it.
 */
export type RunningDeckServer = {
  /**
   * The page URL, such as `http://127.0.0.1:5173/`.
   */
  url: string;

  /**
   * Compiles one module through the deck's Vite pipeline, as a page load would, and fails with what
   * the pipeline threw (deck build errors, possibly wrapped). It succeeds with the warnings the MDX
   * extensions reported for the file, such as a missing image.
   *
   * @param file - The absolute path of the module, such as a slide file.
   */
  compile: (file: string) => Effect.Effect<readonly MdxWarning[], ViteError>;
};

/**
 * Starts deck servers for `deckster shot` and `deckster lint`. Each server lives in the scope of
 * the caller that started it, so it closes when that task ends, even when the task fails. Tests
 * replace the layer with one that serves nothing.
 */
export class DeckServer extends Context.Service<
  DeckServer,
  {
    /**
     * Starts a quiet server for one deck on a free port; it closes when the caller's scope closes.
     *
     * @throws ViteError in the error channel when the server cannot start.
     */
    readonly start: (
      options: DeckServerOptions,
    ) => Effect.Effect<RunningDeckServer, ViteError, Scope.Scope>;
  }
>()('cli/DeckServer') {
  /**
   * Vite dev servers in the current workspace.
   */
  static readonly layer = Layer.effect(
    DeckServer,
    Effect.gen(function* () {
      const { root } = yield* Workspace;
      return DeckServer.of({
        start: (options) =>
          loadLive().pipe(
            Effect.flatMap((live) => live.startViteServer(options.workspaceRoot ?? root, options)),
          ),
      });
    }),
  );
}

/**
 * Loads the module that starts Vite, the first time a server is wanted: importing Vite and the deck
 * plugin takes over a second, which commands that never serve a deck do not pay.
 *
 * @throws ViteError in the error channel when the module does not load.
 */
const loadLive = Effect.fn('DeckServer.loadLive')(function* (): Effect.fn.Return<
  typeof import('#server/deck-server-live.ts'),
  ViteError
> {
  return yield* Effect.tryPromise({
    try: () => import('#server/deck-server-live.ts'),
    catch: (cause) => new ViteError({ cause }),
  });
});
