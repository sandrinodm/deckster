import { loadBrand, type LoadedBrand } from '@deckster/brand/node';
import {
  loadLayoutCatalog,
  type DeckBuildError,
  type LayoutCatalogIndex,
} from '@deckster/vite-plugin';
import { Effect, type FileSystem } from 'effect';

import { firstLine } from '#cli-error.ts';

/**
 * Matches the full stop that ends a sentence.
 */
const TRAILING_PERIOD_PATTERN = /\.$/;

/**
 * Matches the bullet or number that starts an item of a listed problem.
 */
const LIST_MARKER_PATTERN = /^(?:[-*•]|\d+\.)\s+/;

/**
 * The layout catalog of a deck's brand, and what went wrong with the brand's own layouts.
 */
export type BrandCatalog = {
  /**
   * Every layout the deck can use; without the brand's own when the brand did not load.
   */
  catalog: LayoutCatalogIndex;

  /**
   * The brand, or `undefined` when it did not load.
   */
  brand: LoadedBrand | undefined;

  /**
   * The sentence that says why the brand's layouts are left out, or `undefined` when they are in.
   */
  warning: string | undefined;
};

/**
 * Loads the engine and kit layouts plus the layouts of one brand. A brand that does not load, or
 * whose layouts do not fit their fallbacks, does not stop the command: the catalog then has only
 * the engine and kit layouts and a warning says why, so slides can still be listed and added.
 *
 * @param workspaceRoot - The workspace.
 * @param brandName - The brand folder name.
 * @returns The catalog, the brand when it loaded and a warning when its layouts are left out.
 * @throws DeckBuildError in the error channel when the engine or kit catalog does not load.
 */
export const loadBrandCatalog = Effect.fn('loadBrandCatalog')(function* (
  workspaceRoot: string,
  brandName: string,
): Effect.fn.Return<BrandCatalog, DeckBuildError, FileSystem.FileSystem> {
  const loaded = yield* loadBrand(workspaceRoot, brandName).pipe(
    Effect.map((brand): { brand: LoadedBrand } | { problem: string } => ({ brand })),
    Effect.catchTag('BrandError', (error) => Effect.succeed({ problem: error.message })),
  );
  if ('problem' in loaded) {
    return yield* withoutBrand(brandName, loaded.problem);
  }

  const { brand } = loaded;
  const catalog = yield* loadLayoutCatalog(undefined, {
    brand: brand.tokens,
    layoutsFile: brand.layoutsFile,
  }).pipe(
    Effect.map((index): LayoutCatalogIndex | string => index),
    Effect.catchTag('DeckBuildError', (error) => Effect.succeed(error.message)),
  );
  if (typeof catalog === 'string') {
    return yield* withoutBrand(brandName, catalog);
  }

  return { catalog, brand, warning: undefined };
});

/**
 * The catalog without the brand's layouts, with the warning that names the problem.
 *
 * @param brandName - The brand folder name.
 * @param problem - The error message.
 */
const withoutBrand = Effect.fn('withoutBrand')(function* (
  brandName: string,
  problem: string,
): Effect.fn.Return<BrandCatalog, DeckBuildError> {
  return {
    catalog: yield* loadLayoutCatalog(),
    brand: undefined,
    warning:
      `The brand "${brandName}" has a problem, so its own layouts are left out: ` +
      `${problemSummary(problem).replace(TRAILING_PERIOD_PATTERN, '')}. Run \`deck brand check ${brandName}\` for the details.`,
  };
});

/**
 * The first line of an error, joined with its first listed problem when that line only introduces a
 * list ("Invalid brand layouts in brands/x/layouts.ts:").
 *
 * @param problem - The error message.
 */
function problemSummary(problem: string): string {
  const summary = firstLine(problem).trim();
  if (!summary.endsWith(':')) {
    return summary;
  }

  const detail = problem
    .split('\n')
    .slice(1)
    .map((line) => line.trim().replace(LIST_MARKER_PATTERN, ''))
    .find((line) => line !== '');
  return detail === undefined ? summary.slice(0, -1) : `${summary} ${detail}`;
}
