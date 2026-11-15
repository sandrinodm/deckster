import type { PlatformError } from 'effect';
import type { ServerResponse } from 'node:http';
import type { Plugin, ResolvedConfig } from 'vite-plus';

import { isSafeName } from '@deckster/brand';
import { fileExists } from '@deckster/brand/node';
import react from '@vitejs/plugin-react';
import { Effect, FileSystem } from 'effect';
import path from 'node:path';
import { build, normalizePath } from 'vite-plus';

import { pointAtAppFolder, restoreTitle } from '#apps/app-html.ts';
import { appRequest, missingAppMessage } from '#apps/app-requests.ts';
import { APPS_DIR, discoverApps, type AppLocation } from '#apps/discover-apps.ts';
import { deckLocation } from '#decks/deck-paths.ts';
import { guarded } from '#guarded-middleware.ts';
import { makeRunEffect } from '#run-effect.ts';

/**
 * Options for {@link deckAppsPlugin}.
 */
export type DeckAppsOptions = {
  /**
   * The absolute workspace root, the folder that contains `decks/`.
   */
  workspaceRoot: string;

  /**
   * The deck folder name under `decks/`.
   */
  deck: string;
};

/**
 * The HTTP status of a request for an app the deck does not have.
 */
const NOT_FOUND = 404;

/**
 * The HTTP status of a request whose app name is not valid percent-encoding.
 */
const BAD_REQUEST = 400;

/**
 * Files the React plugin compiles inside an app.
 */
const APP_REACT_FILES = /\.[jt]sx?$/;

/**
 * The chunk size, in kilobytes, above which an app's build warns. An app carries React and the
 * bridge's schema validation, which together pass Vite's default of 500.
 */
const APP_CHUNK_WARNING_KB = 800;

/**
 * Serves and builds the deck's mini apps. Each folder under `decks/<deck>/apps/` with an
 * `index.html` is an additional entry of the deck: in dev and preview it is served at
 * `apps/<name>/`, and a build writes it to `dist/apps/<name>/` with relative URLs, so the deck
 * hosts anywhere. Apps resolve React from the workspace and share nothing else with the deck: they
 * run in their own iframe document with their own CSS and globals. The dev server also pre-scans
 * every app's dependencies, so opening an app never makes Vite reload the page. A request for an
 * app the deck does not have is a 404 in dev and preview, never the deck's own page, which would
 * load the deck inside its own frame.
 *
 * @param options - The workspace and the deck.
 */
export function deckAppsPlugin(options: DeckAppsOptions): Plugin {
  const deck = deckLocation(options.workspaceRoot, options.deck);
  const run = makeRunEffect();
  let config: ResolvedConfig | undefined;
  /**
   * Lists the deck's apps, read fresh so a new folder shows without a restart.
   */
  const apps = (): Promise<AppLocation[]> => run(discoverApps(deck.dir));
  return {
    name: 'deck:apps',

    async config() {
      const found = await apps();
      return { optimizeDeps: { entries: found.map((app) => normalizePath(app.entry)) } };
    },

    configResolved(resolved) {
      config = resolved;
    },

    configureServer(server) {
      server.middlewares.use(
        guarded(async (request, response, next) => {
          const wanted = appRequest(request.url ?? '');
          if (wanted === undefined) {
            next();
            return;
          }

          if (wanted.malformed === true) {
            badRequest(response);
            return;
          }

          const found = await apps();
          const app = found.find((candidate) => candidate.name === wanted.name);
          if (app === undefined) {
            notFound(response, options.deck, wanted.name, found);
            return;
          }

          if (!wanted.page) {
            next();
            return;
          }

          try {
            const source = await run(readAppPage(app.entry));
            const prepared = pointAtAppFolder(source, normalizePath(app.dir));
            const page = await server.transformIndexHtml(request.url ?? '/', prepared);
            response.setHeader('Content-Type', 'text/html');
            response.end(restoreTitle(page, source));
          } catch (error) {
            next(error);
          }
        }),
      );
    },

    configurePreviewServer(server) {
      server.middlewares.use(
        guarded(async (request, response, next) => {
          const wanted = appRequest(request.url ?? '');
          if (wanted === undefined) {
            next();
            return;
          }

          if (wanted.malformed === true) {
            badRequest(response);
            return;
          }

          const { root, build: output } = server.config;
          const built = path.resolve(root, output.outDir, APPS_DIR, wanted.name);
          // The name comes decoded from the URL, so `..%2F` must not probe files outside `apps/`.
          if (isSafeName(wanted.name) && (await run(fileExists(path.join(built, 'index.html'))))) {
            next();
            return;
          }

          const names = (await apps()).map((candidate) => candidate.name);
          notFound(response, options.deck, wanted.name, names);
        }),
      );
    },

    async closeBundle() {
      if (config === undefined || config.command !== 'build') {
        return;
      }

      for (const app of await apps()) {
        await build({
          configFile: false,
          root: app.dir,
          base: './',
          logLevel: 'warn',
          cacheDir: path.join(config.cacheDir, `app-${app.name}`),
          resolve: { dedupe: ['react', 'react-dom'] },
          // An inline PostCSS config, so the build never loads a postcss.config.js from the app's
          // folder, which an agent may edit, into Node.
          css: { postcss: {} },
          plugins: [react({ include: APP_REACT_FILES })],
          build: {
            outDir: path.join(config.build.outDir, APPS_DIR, app.name),
            emptyOutDir: true,
            chunkSizeWarningLimit: APP_CHUNK_WARNING_KB,
          },
        });
      }
    },
  };
}

/**
 * Answers a request whose app name is not valid percent-encoding with a 400.
 *
 * @param response - The server response.
 */
function badRequest(response: ServerResponse): void {
  response.statusCode = BAD_REQUEST;
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.end('The app name in the URL is not valid percent-encoding.\n');
}

/**
 * Answers a request for an app the deck does not have with a 404 that names the apps it has.
 *
 * @param response - The server response.
 * @param deck - The deck folder name.
 * @param name - The app the request asked for.
 * @param apps - The deck's apps, or their names.
 */
function notFound(
  response: ServerResponse,
  deck: string,
  name: string,
  apps: readonly (AppLocation | string)[],
): void {
  const names = apps.map((app) => (typeof app === 'string' ? app : app.name));
  response.statusCode = NOT_FOUND;
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.end(missingAppMessage(deck, name, names));
}

/**
 * Reads an app's `index.html`.
 *
 * @param entry - The absolute path of the page.
 */
const readAppPage = Effect.fn('readAppPage')(function* (
  entry: string,
): Effect.fn.Return<string, PlatformError.PlatformError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.readFileString(entry);
});
