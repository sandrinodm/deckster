import type { LoadedBrand } from '@deckster/brand/node';

import { LAYOUTS_FILE, type BrandProblem } from '@deckster/brand';
import { checkBrandLayouts, type BrandLayoutCheck } from '@deckster/kit/catalog';
import {
  deckCatalog,
  loadLayoutCatalog,
  type DeckBuildError,
  type LayoutProblem,
  type LayoutProblemCode,
  type LocalLayouts,
} from '@deckster/vite-plugin';
import { Effect, type FileSystem } from 'effect';
import path from 'node:path';

/**
 * A finding with the workspace-relative brand, layouts or code layout file it describes. A code
 * layout's problem also has its id and, when it is one layout's, the layout's name.
 */
export type BrandFileProblem = BrandProblem & {
  /**
   * The file at fault, relative to the workspace.
   */
  file: string;

  /**
   * The problem id of a code layout's problem, such as `layout-load-failed`.
   */
  code?: LayoutProblemCode;

  /**
   * The code layout the problem belongs to, by folder name.
   */
  layout?: string;
};

/**
 * What {@link checkCatalogLayouts} finds: the problems of the brand's data layouts, and the brand's
 * code layouts with theirs.
 */
export type CatalogLayoutCheck = BrandLayoutCheck & {
  /**
   * The brand's code layouts, with their problems in `problems`.
   */
  local: LocalLayouts;
};

/**
 * Checks the brand's layouts against the engine and kit contracts that decks use: its data layouts
 * (`layouts.ts`) against their fallbacks, and its code layouts (`layouts/<name>/`) for every
 * problem the build reports. With `code: 'skip'` the code layouts are only found and their folders
 * checked; no file of the brand is ever run, which is how a fetched brand is checked.
 *
 * @param root - The workspace root, or the staging folder of a brand being added.
 * @param brand - The loaded brand.
 * @param code - `load` to run the code layouts' contracts, `skip` to never run them.
 * @returns The data layouts' errors and warnings, and the code layouts with their problems.
 * @throws DeckBuildError in the error channel when the engine or kit catalog does not load.
 */
export const checkCatalogLayouts = Effect.fn('checkCatalogLayouts')(function* (
  root: string,
  brand: LoadedBrand,
  code: 'load' | 'skip',
): Effect.fn.Return<CatalogLayoutCheck, DeckBuildError, FileSystem.FileSystem> {
  const { layouts } = brand.tokens;
  const base = yield* loadLayoutCatalog();
  const data =
    layouts.length === 0
      ? { errors: [], warnings: [] }
      : checkBrandLayouts(
          layouts,
          [...base.values()].map((layout) => layout.contract),
        );
  // Data layouts that do not fit fail the whole catalog, so the code layouts are then checked
  // without them; their problems are in `data` already.
  const catalogBrand =
    data.errors.length === 0 ? brand : { ...brand, tokens: { ...brand.tokens, layouts: [] } };
  const { local } = yield* deckCatalog({ root, brand: catalogBrand, code });
  return { ...data, local };
});

/**
 * A code layout's problem as a brand finding, on the layout's file as authors see it.
 *
 * @param brand - The brand the layout belongs to.
 * @param problem - The problem.
 */
export function layoutProblemWithFile(
  brand: LoadedBrand,
  problem: LayoutProblem,
): BrandFileProblem {
  const relative = path.relative(brand.location.dir, problem.file).split(path.sep).join('/');
  const file = path.posix.join(path.posix.dirname(brand.location.displayPath), relative);
  return {
    path: '',
    message: problem.message,
    fix: problem.fix,
    file,
    code: problem.code,
    ...(problem.layout === undefined ? {} : { layout: problem.layout }),
  };
}

/**
 * The display path of `layouts.ts` next to a workspace-relative `brand.ts`.
 */
export function layoutsDisplayPath(brandFile: string): string {
  return path.posix.join(path.posix.dirname(brandFile), LAYOUTS_FILE);
}

/**
 * Attaches a display path to a finding, using `layouts.ts` for a layout field when present.
 */
export function brandProblemWithFile(
  problem: BrandProblem,
  files: { file: string; layoutsFile?: string },
): BrandFileProblem {
  const file = problem.path.startsWith('layouts[') ? (files.layoutsFile ?? files.file) : files.file;
  return { ...problem, file };
}
