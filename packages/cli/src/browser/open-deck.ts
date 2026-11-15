import type { BrandError } from '@deckster/brand';
import type { FileSystem, Scope } from 'effect';

import { DEFAULT_BRAND } from '@deckster/brand';
import { loadBrand, type LoadedBrand } from '@deckster/brand/node';
import { findDeck, loadDeck, type DeckBuildError, type LoadedDeck } from '@deckster/vite-plugin';
import { Effect } from 'effect';

import type { DeckPage } from '#browser/deck-page.ts';
import type { BrowserError, CliError, ViteError } from '#cli-error.ts';
import type { LintFinding } from '#lint/types.ts';

import { DeckBrowser } from '#browser/deck-browser.ts';
import { checkSlideFiles } from '#lint/check-slide-files.ts';
import { deckProblemsError, type DeckPlace, type DeckProblemsError } from '#lint/deck-problems.ts';
import { DeckServer } from '#server/deck-server.ts';
import { Workspace } from '#workspace.ts';

/**
 * Which deck to open, in which brand and at which pixel density.
 */
export type OpenDeckOptions = {
  /**
   * The deck folder name.
   */
  deck: string;

  /**
   * A brand folder that replaces the deck config's `brand`; `undefined` keeps the deck's own.
   */
  brand: string | undefined;

  /**
   * Pixel density; 1 for 1920x1080.
   */
  scale: number;

  /**
   * Open the deck from this workspace instead of the current one, such as a checkout of an older
   * revision; leave it out for the current workspace.
   */
  workspaceRoot?: string;
};

/**
 * What a task gets once the deck is open.
 */
export type OpenedDeck = {
  /**
   * The loaded deck.
   */
  deck: LoadedDeck;

  /**
   * The workspace and the deck's folders, for file names in findings.
   */
  place: DeckPlace;

  /**
   * The brand the deck renders with: the override, else the deck config's, else `default`.
   */
  brand: LoadedBrand;

  /**
   * The deck open in the browser.
   */
  page: DeckPage;

  /**
   * What the MDX extensions warned about while the slides compiled, as findings.
   */
  buildWarnings: LintFinding[];
};

/**
 * Every way opening a deck can fail.
 */
export type OpenDeckError =
  | BrandError
  | BrowserError
  | CliError
  | DeckBuildError
  | DeckProblemsError
  | ViteError;

/**
 * Loads a deck and its brand, checks that every slide compiles, serves the deck and opens it in a
 * browser for the rest of the scope; the server and the page close when the scope closes, even when
 * the task fails.
 *
 * @param options - The deck, the brand override and the pixel density.
 * @throws DeckBuildError in the error channel for a missing deck or a bad deck config or slide
 *   list, BrandError for a brand that does not load, DeckProblemsError when slide files fail to
 *   compile, and CliError, BrowserError or ViteError when the browser, the server or the page fails
 *   to start.
 */
export const openDeck = Effect.fn('openDeck')(function* (
  options: OpenDeckOptions,
): Effect.fn.Return<
  OpenedDeck,
  OpenDeckError,
  Workspace | FileSystem.FileSystem | DeckServer | DeckBrowser | Scope.Scope
> {
  const workspaceRoot = options.workspaceRoot ?? (yield* Workspace).root;
  const location = yield* findDeck(workspaceRoot, options.deck);
  const deck = yield* loadDeck(workspaceRoot, location);
  const place: DeckPlace = { workspaceRoot, location };
  const brand = yield* loadBrand(
    workspaceRoot,
    options.brand ?? deck.config.brand ?? DEFAULT_BRAND,
  );
  const server = yield* (yield* DeckServer).start({
    deck: options.deck,
    brand: options.brand,
    ...(options.workspaceRoot === undefined ? {} : { workspaceRoot: options.workspaceRoot }),
  });
  const checks = yield* checkSlideFiles(server, deck, place);
  if (checks.problems.length > 0) {
    return yield* deckProblemsError(checks.problems, options.deck);
  }

  const page = yield* (yield* DeckBrowser).open(server.url, {
    scale: options.scale,
    workspaceRoot,
  });
  return { deck, place, brand, page, buildWarnings: checks.warnings };
});
