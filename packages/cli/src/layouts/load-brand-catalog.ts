import { loadBrand, type LoadedBrand } from '@deckster/brand/node';
import {
  deckCatalog,
  loadLayoutCatalog,
  type DeckBuildError,
  type DeckCatalog,
  type DeckLocation,
  type LayoutCatalogIndex,
  type LayoutProblem,
  type LocalLayouts,
} from '@deckster/vite-plugin';
import { Effect, type FileSystem } from 'effect';

import { firstLine } from '#cli-error.ts';
import { displayFile } from '#lint/deck-problems.ts';

/**
 * Matches the full stop that ends a sentence.
 */
const TRAILING_PERIOD_PATTERN = /\.$/;

/**
 * Matches the bullet or number that starts an item of a listed problem.
 */
const LIST_MARKER_PATTERN = /^(?:[-*•]|\d+\.)\s+/;

/**
 * The code layouts of a catalog that left out its brand: none were looked for.
 */
const NO_LOCAL_LAYOUTS: LocalLayouts = {
  /**
   * No layout folders were read.
   */
  layouts: [],

  /**
   * No contracts were loaded.
   */
  catalogs: [],

  /**
   * No kit layout is replaced.
   */
  replaced: [],

  /**
   * No files were found.
   */
  files: [],

  /**
   * The brand's problem is the warning instead.
   */
  problems: [],
};

/**
 * The layout catalog of a deck's brand and the deck, and what went wrong with their own layouts.
 */
export type BrandCatalog = {
  /**
   * Every layout the deck can use; without the brand's and the deck's own when the brand did not
   * load, and without a code layout that has a problem.
   */
  catalog: LayoutCatalogIndex;

  /**
   * The brand, or `undefined` when it did not load.
   */
  brand: LoadedBrand | undefined;

  /**
   * The code layouts of the brand and the deck; none when the brand did not load.
   */
  local: LocalLayouts;

  /**
   * One sentence per problem that leaves layouts out: the brand's, or one code layout's. Empty when
   * every layout is in.
   */
  warnings: readonly string[];
};

/**
 * Loads the engine and kit layouts, the layouts of one brand (data and code) and, given a deck, the
 * deck's code layouts, running their contracts. A brand that does not load, or whose data layouts
 * do not fit their fallbacks, does not stop the command: the catalog then has only the engine and
 * kit layouts and a warning says why. A code layout with a problem is left out on its own, with a
 * warning. So slides can still be listed and added.
 *
 * @param workspaceRoot - The workspace.
 * @param brandName - The brand folder name.
 * @param deck - The deck whose code layouts join the catalog; leave it out for the brand alone.
 * @returns The catalog, the brand when it loaded, the code layouts and the warnings.
 * @throws DeckBuildError in the error channel when the engine or kit catalog does not load.
 */
export const loadBrandCatalog = Effect.fn('loadBrandCatalog')(function* (
  workspaceRoot: string,
  brandName: string,
  deck?: DeckLocation,
): Effect.fn.Return<BrandCatalog, DeckBuildError, FileSystem.FileSystem> {
  const loaded = yield* loadBrand(workspaceRoot, brandName).pipe(
    Effect.map((brand): { brand: LoadedBrand } | { problem: string } => ({ brand })),
    Effect.catchTag('BrandError', (error) => Effect.succeed({ problem: error.message })),
  );
  if ('problem' in loaded) {
    return yield* withoutBrand(brandName, loaded.problem);
  }

  const { brand } = loaded;
  const found = yield* deckCatalog({ root: workspaceRoot, brand, deck, code: 'load' }).pipe(
    Effect.map((catalog): DeckCatalog | string => catalog),
    Effect.catchTag('DeckBuildError', (error) => Effect.succeed(error.message)),
  );
  if (typeof found === 'string') {
    return yield* withoutBrand(brandName, found);
  }

  return {
    catalog: found.index,
    brand,
    local: found.local,
    warnings: found.local.problems.map((problem) => layoutProblemWarning(workspaceRoot, problem)),
  };
});

/**
 * The warning for a code layout left out of the catalog: the file, what is wrong and the fix.
 *
 * @param workspaceRoot - The workspace, which file names are relative to.
 * @param problem - The layout's problem; its file is named unless the message names it.
 */
export function layoutProblemWarning(workspaceRoot: string, problem: LayoutProblem): string {
  const subject =
    problem.layout === undefined ? 'Code layouts are' : `The code layout "${problem.layout}" is`;
  const message = firstLine(problem.message).replace(TRAILING_PERIOD_PATTERN, '');
  const file = displayFile(workspaceRoot, problem.file);
  const where = message.includes(file) ? '' : ` in ${file}`;
  return `${subject} left out (${problem.code}${where}): ${message}. Fix: ${problem.fix}`;
}

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
    local: NO_LOCAL_LAYOUTS,
    warnings: [
      `The brand "${brandName}" has a problem, so its own layouts are left out: ` +
        `${problemSummary(problem).replace(TRAILING_PERIOD_PATTERN, '')}. Run \`deckster brand check ${brandName}\` for the details.`,
    ],
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
