import type { Scope } from 'effect';

import { deckViteConfig } from '@deckster/vite-plugin';
import { Effect } from 'effect';
import { mergeConfig, preview, type PreviewServer } from 'vite-plus';

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
};

/**
 * Serves a deck's `dist/` with Vite's preview server in the caller's scope (`deck preview` and
 * `deck present --built`); it closes with the scope, and Vite's own exit handlers are taken back so
 * Ctrl+C and SIGTERM run the command's finalizers.
 *
 * @param options - The deck and how to listen.
 */
export const startPreviewServer = Effect.fn('startPreviewServer')(function* (
  options: PreviewServerOptions,
): Effect.fn.Return<PreviewServer, ViteError, Scope.Scope> {
  const config = mergeConfig(
    deckViteConfig({ workspaceRoot: options.workspaceRoot, deck: options.deck }),
    {
      ...(options.logLevel === undefined ? {} : { logLevel: options.logLevel }),
      preview: { port: options.port, strictPort: options.port !== undefined, host: options.host },
    },
  );
  return yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () => withoutViteExitHandlers(() => preview(config)),
      catch: (cause) => new ViteError({ cause }),
    }),
    (opened) => Effect.promise(() => opened.close()),
  );
});
