import { deckViteConfig } from '@deckster/vite-plugin';
import { Effect, type Scope } from 'effect';
import path from 'node:path';
import { mergeConfig, preview, type PreviewServer } from 'vite';

import { previewChooserLinkPlugin, type ChooserLink } from '#chooser/chooser-link.ts';
import { CHOOSER_PORT_REUSED, withFreshChooserPort } from '#chooser/chooser-port.ts';
import { ViteError } from '#cli-error.ts';
import { withoutViteExitHandlers } from '#server/shutdown.ts';

/**
 * What a preview server of a built deck is started with.
 */
export type PreviewServerOptions = {
  /**
   * The workspace root.
   */
  readonly workspaceRoot: string;

  /**
   * The deck folder name.
   */
  readonly deck: string;

  /**
   * The port, failing when taken; undefined for Vite's default.
   */
  readonly port: number | undefined;

  /**
   * Whether to listen on all network interfaces.
   */
  readonly host: boolean;

  /**
   * Vite's log level; `warn` keeps the terminal quiet.
   */
  readonly logLevel?: 'info' | 'warn';

  /**
   * Holds the launcher selection and isolates its preview server from previous selections.
   */
  readonly chooser?: ChooserLink;
};

/**
 * Serves a deck's `dist/` with Vite's preview server in the caller's scope (`deckster preview` and
 * `deckster present --built`); it closes with the scope, and Vite's own exit handlers are taken
 * back so Ctrl+C and SIGTERM run the command's finalizers.
 *
 * @param options - The deck and how to listen.
 */
export const startPreviewServer = Effect.fn('startPreviewServer')(function* (
  options: PreviewServerOptions,
): Effect.fn.Return<PreviewServer, ViteError, Scope.Scope> {
  const chooser = options.chooser;
  if (chooser === undefined) {
    return yield* servePreview(options);
  }

  const open = Effect.gen(function* () {
    const server = yield* servePreview(options);
    const address = server.httpServer.address();
    if (typeof address !== 'object' || address === null || !chooser.claimPort(address.port)) {
      return yield* Effect.fail(CHOOSER_PORT_REUSED);
    }

    return server;
  });
  return yield* withFreshChooserPort(
    open,
    () => new ViteError({ cause: new Error('Could not assign a fresh preview server port.') }),
  );
});

/**
 * Opens one Vite preview server and installs the chooser link only for browser selections.
 */
function servePreview(
  options: PreviewServerOptions,
): Effect.Effect<PreviewServer, ViteError, Scope.Scope> {
  const chooser = options.chooser;
  const config = mergeConfig(
    deckViteConfig({ workspaceRoot: options.workspaceRoot, deck: options.deck }),
    {
      ...(options.logLevel === undefined ? {} : { logLevel: options.logLevel }),
      preview: {
        port: options.port,
        strictPort: options.port !== undefined,
        host: chooser === undefined ? options.host : '127.0.0.1',
      },
      ...(chooser === undefined || chooser.desktop === true
        ? {}
        : {
            plugins: [
              previewChooserLinkPlugin(
                chooser,
                path.join(options.workspaceRoot, 'decks', options.deck, 'dist', 'index.html'),
              ),
            ],
          }),
    },
  );
  return Effect.acquireRelease(
    Effect.tryPromise({
      try: () => withoutViteExitHandlers(() => preview(config)),
      catch: (cause) => new ViteError({ cause }),
    }),
    (opened) => Effect.promise(() => opened.close()),
  );
}
