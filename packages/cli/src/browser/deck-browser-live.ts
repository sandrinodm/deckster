import { playwrightInstallCommand } from '@deckster/brand/node';
import { Effect, type Scope } from 'effect';
import { chromium, type Browser } from 'playwright';

import type { OpenDeckPageOptions } from '#browser/deck-browser.ts';
import type { DeckPage } from '#browser/deck-page.ts';

import { loadDeckPage } from '#browser/deck-page.ts';
import { browserError, cliError, firstLine, type BrowserError, type CliError } from '#cli-error.ts';
import { CANVAS_SIZE } from '#workspace.ts';

/**
 * What a failed page open is called in the error message.
 */
const OPEN_PAGE_ACTION = 'open a page';

/**
 * The Chromium switches every deck page runs with. `--disable-lcd-text` sets text in grayscale
 * antialiasing, as Chromium on macOS always does: on Linux it otherwise uses subpixel (LCD)
 * antialiasing, whose colour fringe reaches a pixel past a glyph's ink bounds, and a repaint when a
 * web font replaces its fallback face covers only those bounds. A screenshot then depends on
 * whether the slide was ever painted in the fallback face, which is a race with the font load.
 */
const CHROMIUM_ARGS = ['--disable-lcd-text'];

/**
 * Launches headless Chromium, with the install command when it is missing.
 */
export function launchBrowser(): Effect.Effect<Browser, CliError> {
  return Effect.tryPromise({
    try: () => chromium.launch({ args: CHROMIUM_ARGS }),
    catch: (error) => {
      const detail = firstLine(error instanceof Error ? error.message : String(error));
      return cliError(
        `Could not start Chromium: ${detail}\n` +
          `Install the browser with \`${playwrightInstallCommand()}\`.`,
      );
    },
  });
}

/**
 * Launches headless Chromium, closed when the scope closes.
 */
export const acquireBrowser = Effect.fn('acquireBrowser')(function* (): Effect.fn.Return<
  Browser,
  CliError,
  Scope.Scope
> {
  return yield* Effect.acquireRelease(launchBrowser(), (opened) =>
    Effect.promise(() => opened.close()),
  );
});

/**
 * Opens a deck in a fresh page of a browser sized to the canvas, in `?static` mode with reduced
 * motion; the page closes when the scope does.
 *
 * @param browser - The shared browser.
 * @param url - The page URL.
 * @param options - Pixel density and workspace root.
 */
export const openDeckPage = Effect.fn('openDeckPage')(function* (
  browser: Browser,
  url: string,
  options: OpenDeckPageOptions,
): Effect.fn.Return<DeckPage, CliError | BrowserError, Scope.Scope> {
  const context = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () =>
        browser.newContext({
          viewport: CANVAS_SIZE,
          deviceScaleFactor: options.scale,
          reducedMotion: 'reduce',
        }),
      catch: (cause) => browserError(OPEN_PAGE_ACTION, cause),
    }),
    (created) => Effect.promise(() => created.close()),
  );
  const page = yield* Effect.tryPromise({
    try: () => context.newPage(),
    catch: (cause) => browserError(OPEN_PAGE_ACTION, cause),
  });
  return yield* loadDeckPage(page, url, options);
});
