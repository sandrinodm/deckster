import { deckBrandName, findDeck, loadDeck, type DeckBuildError } from '@deckster/vite-plugin';
import * as NodeServices from '@effect/platform-node/NodeServices';
import { Effect, FileSystem } from 'effect';

import { docsError, type DocsError } from '#docs-error.ts';

/**
 * Where the docs allowlist lives in the repository, for messages.
 */
const ALLOWLIST_FILE = 'scripts/docs/allowlist.ts';

/**
 * The decks and brands the docs site publishes.
 */
export type DocsAllowlist = {
  /**
   * The absolute workspace root.
   */
  readonly root: string;

  /**
   * The deck folder names the docs publish.
   */
  readonly decks: readonly string[];

  /**
   * The brand folder names the docs publish.
   */
  readonly brands: readonly string[];
};

/**
 * Checks that every published deck renders with a published brand, as the build resolves it (the
 * deck config's `brand`, else the default brand). A deck whose brand is not allowlisted would put
 * that brand's look and assets on the public site.
 *
 * @param allowlist - The workspace and the published decks and brands.
 * @throws DocsError in the error channel naming each deck and its brand when any brand is not
 *   allowlisted; DeckBuildError when a deck is missing or its config is invalid.
 */
export const checkDocsBrands = Effect.fn('checkDocsBrands')(function* (
  allowlist: DocsAllowlist,
): Effect.fn.Return<void, DocsError | DeckBuildError, FileSystem.FileSystem> {
  const published = new Set(allowlist.brands);
  const outside: string[] = [];
  for (const name of allowlist.decks) {
    const deck = yield* loadDeck(allowlist.root, yield* findDeck(allowlist.root, name));
    const brand = deckBrandName(deck.config);
    if (!published.has(brand)) {
      outside.push(`decks/${name} renders with the brand "${brand}"`);
    }
  }

  if (outside.length > 0) {
    return yield* docsError(
      `${outside.join('; ')}, which DOCS_BRANDS in ${ALLOWLIST_FILE} does not publish. ` +
        'Add the brand to DOCS_BRANDS, or set an allowlisted brand in the deck config.',
    );
  }
});

/**
 * Runs {@link checkDocsBrands} for a script, outside Effect.
 *
 * @param allowlist - The workspace and the published decks and brands.
 * @returns A promise that resolves when every published deck uses a published brand.
 * @throws Error with the check's message when it fails.
 */
export function assertDocsBrands(allowlist: DocsAllowlist): Promise<void> {
  return Effect.runPromise(
    checkDocsBrands(allowlist).pipe(
      Effect.mapError((error) => new Error(error.message)),
      Effect.provide(NodeServices.layer),
    ),
  );
}
