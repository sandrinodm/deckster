import type { LoadedBrand } from '@deckster/brand/node';

import { LAYOUTS_FILE, type BrandProblem } from '@deckster/brand';
import { checkBrandLayouts, type BrandLayoutCheck } from '@deckster/kit/catalog';
import {
  checkReplacedSlides,
  deckCatalog,
  type DeckBuildError,
  type DeckCatalog,
  type DeckLocation,
  type LayoutProblem,
  type LayoutProblemCode,
  type LocalLayouts,
} from '@deckster/vite-plugin';
import { Effect, Result, type FileSystem } from 'effect';
import path from 'node:path';

import { BRAND_SOURCE_PREFIX } from '#layouts/list-layouts.ts';

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

  /**
   * Set on what is not an error: `warning` for something a deck loses, `note` for a change worth
   * knowing. A finding without it is an error, or a warning in the list of warnings.
   */
  level?: 'warning' | 'note';
};

/**
 * What {@link checkCatalogLayouts} finds: the problems of the brand's data layouts, and the brand's
 * code layouts with theirs.
 */
export type CatalogLayoutCheck = BrandLayoutCheck & {
  /**
   * The brand's code layouts, with their problems in `problems` and the warnings and notes of the
   * replacements that joined in `warnings`.
   */
  local: LocalLayouts;

  /**
   * One error per slide of a deck on the brand that uses a replaced kit layout and does not fit its
   * replacement; empty when nothing is replaced.
   */
  slideProblems: LayoutProblem[];
};

/**
 * Checks the brand's layouts against the layouts decks can use: its data layouts (`layouts.ts`)
 * against the engine's and kit's layouts and the brand's code layouts (a data layout may fall back
 * to one, and a replacement counts as the kit layout it replaces), and its code layouts
 * (`layouts/<name>/`) for every problem the build reports, with the slides of the workspace's decks
 * on a replaced kit layout. With `code: 'skip'` the code layouts are only found and their folders
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
  // Data layouts that do not fit fail the whole catalog, so the catalog is then loaded without
  // them, for the contracts they are checked against.
  const withData = yield* Effect.result(deckCatalog({ root, brand, code }));
  const catalogBrand = Result.isSuccess(withData) ? brand : withoutDataLayouts(brand);
  const found = Result.isSuccess(withData)
    ? withData.success
    : yield* deckCatalog({ root, brand: catalogBrand, code });
  const base = [...found.index.values()]
    .filter((layout) => !layout.source.startsWith(BRAND_SOURCE_PREFIX))
    .map((layout) => layout.contract);
  const data =
    layouts.length === 0 ? { errors: [], warnings: [] } : checkBrandLayouts(layouts, base);
  // A deck's own replacement is that deck's to check, as `layouts check --deck` does.
  const replacing = yield* checkReplacements(root, catalogBrand, found.local);
  const slideProblems = replacing.filter((problem) => isInside(brand.location.dir, problem.file));
  return { ...data, local: found.local, slideProblems };
});

/**
 * Checks the slides of the workspace's decks that use a kit layout the code layouts replace: each
 * must still decode against its replacement. The build does not run this, because it fails a slide
 * that does not fit on its own. Checks nothing when no replacement joined the catalog.
 *
 * @param root - The absolute workspace root.
 * @param brand - The loaded brand: its decks, or `deck` alone, are checked.
 * @param local - The code layouts of the brand (and deck) from `deckCatalog`.
 * @param deck - One deck to check whatever brand it names, instead of every deck on the brand.
 * @returns One `layout-replace-breaks` problem per slide problem; empty when every slide fits.
 * @throws DeckBuildError in the error channel when a deck's catalog does not load.
 */
export const checkReplacements = Effect.fn('checkReplacements')(function* (
  root: string,
  brand: LoadedBrand,
  local: DeckCatalog['local'],
  deck?: DeckLocation,
): Effect.fn.Return<LayoutProblem[], DeckBuildError, FileSystem.FileSystem> {
  if (local.replaced.length === 0) {
    return [];
  }

  return yield* checkReplacedSlides({ root, brand, deck });
});

/**
 * The brand without its data layouts.
 *
 * @param brand - The loaded brand.
 */
function withoutDataLayouts(brand: LoadedBrand): LoadedBrand {
  return { ...brand, tokens: { ...brand.tokens, layouts: [] } };
}

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
    ...(problem.level === undefined ? {} : { level: problem.level }),
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

/**
 * Whether a file is inside a folder.
 *
 * @param dir - The absolute folder.
 * @param file - The absolute path of the file.
 */
function isInside(dir: string, file: string): boolean {
  const relative = path.relative(dir, file);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}
