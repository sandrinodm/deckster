import { deckViteConfig, type DeckPluginApi } from '@deckster/vite-plugin';
import { Effect, type Scope } from 'effect';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer, mergeConfig, type ViteDevServer } from 'vite-plus';

import type { DeckServerOptions, RunningDeckServer } from '#server/deck-server.ts';

import { ViteError } from '#cli-error.ts';
import { WORKSPACE_ROOT } from '#workspace.ts';

/**
 * The name of `@deckster/vite-plugin`'s deck plugin, whose `api` reports each slide's build
 * warnings.
 */
const DECK_PLUGIN_NAME = 'deck';

/**
 * How long closing a server waits for its requests to settle, in milliseconds.
 */
const REQUESTS_IDLE_TIMEOUT_MS = 500;

/**
 * Closes a Vite dev server after giving the requests it is still working on a moment to finish: on
 * a cold cache the warm-up transform of the entry is still resolving the deck's virtual modules,
 * and closing under it makes Vite log a "Pre-transform error" that is not one. The wait is bounded
 * and a failure of it is ignored, so shutdown is never held longer than the bound.
 *
 * @param server - The running dev server.
 */
export const closeDevServer = Effect.fn('closeDevServer')(function* (
  server: ViteDevServer,
): Effect.fn.Return<void> {
  yield* Effect.tryPromise(() => server.waitForRequestsIdle()).pipe(
    Effect.timeout(`${REQUESTS_IDLE_TIMEOUT_MS} millis`),
    Effect.ignore,
  );
  yield* Effect.promise(() => server.close());
});

/**
 * Starts a quiet Vite dev server for one deck on a free port, closed when the scope closes. Hot
 * reload is off so the page never changes under a screenshot, and the page's console is not
 * forwarded to the terminal. The framework's own folders stay readable even when the workspace is a
 * different folder, as it is for the test fixtures.
 *
 * @param workspaceRoot - The workspace that contains `decks/<deck>`.
 * @param options - The deck and the brand.
 * @throws ViteError in the error channel when the server cannot start; a server that reports no
 *   address is a defect.
 */
export const startViteServer = Effect.fn('startViteServer')(function* (
  workspaceRoot: string,
  options: DeckServerOptions,
): Effect.fn.Return<RunningDeckServer, ViteError, Scope.Scope> {
  const pluginConfig = yield* viteConfigFactory(workspaceRoot);
  const base = pluginConfig({
    workspaceRoot,
    deck: options.deck,
    ...(options.brand === undefined ? {} : { brand: options.brand }),
  });
  const config = mergeConfig(base, {
    logLevel: 'error',
    clearScreen: false,
    server: {
      host: '127.0.0.1',
      port: 0,
      hmr: false,
      // The page's console belongs to the lint and shot reports, not the terminal.
      forwardConsole: false,
      fs: { allow: [WORKSPACE_ROOT] },
    },
  });
  const vite = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () => createServer(config),
      catch: (cause) => new ViteError({ cause }),
    }),
    closeDevServer,
  );
  yield* Effect.tryPromise({
    try: () => vite.listen(),
    catch: (cause) => new ViteError({ cause }),
  });
  const url = vite.resolvedUrls?.local[0];
  if (url === undefined) {
    return yield* Effect.die(new Error('The deck server started but reported no local URL.'));
  }

  return { url, compile: deckCompiler(vite) };
});

/**
 * The `compile` function of a running dev server: it compiles a module through the deck's Vite
 * pipeline, as a page load would, and reports the warnings the MDX extensions raised for it.
 *
 * @param vite - A running Vite dev server for a deck.
 */
export function deckCompiler(vite: ViteDevServer): RunningDeckServer['compile'] {
  const deckApi = vite.config.plugins.find((plugin) => plugin.name === DECK_PLUGIN_NAME)?.api as
    | DeckPluginApi
    | undefined;
  return (file) =>
    Effect.tryPromise({
      try: () => vite.transformRequest(`/@fs${file}`),
      catch: (cause) => new ViteError({ cause }),
    }).pipe(Effect.map(() => deckApi?.slideWarnings(file) ?? []));
}

/**
 * The function that builds a deck's Vite config. A workspace that is not the framework's own, such
 * as a checkout of an older revision, is served with its own `@deckster/vite-plugin`, so the engine
 * page, the kit and the slides all come from one revision; loading two copies of the engine breaks
 * React context. When that package cannot be loaded, this checkout's is used.
 *
 * @param workspaceRoot - The workspace that contains `decks/<deck>`.
 */
const viteConfigFactory = Effect.fn('viteConfigFactory')(function* (
  workspaceRoot: string,
): Effect.fn.Return<typeof deckViteConfig> {
  if (workspaceRoot === WORKSPACE_ROOT) {
    return deckViteConfig;
  }

  const entry = path.join(workspaceRoot, 'packages', 'vite-plugin', 'src', 'index.ts');
  const own = yield* Effect.tryPromise({
    try: () => import(pathToFileURL(entry).href) as Promise<{ deckViteConfig?: unknown }>,
    catch: (cause) => cause,
  }).pipe(Effect.orElseSucceed(() => undefined));
  return typeof own?.deckViteConfig === 'function'
    ? (own.deckViteConfig as typeof deckViteConfig)
    : deckViteConfig;
});
