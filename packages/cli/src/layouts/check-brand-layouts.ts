import type { LoadedBrand } from '@deckster/brand/node';

import { LAYOUTS_FILE, type BrandProblem } from '@deckster/brand';
import {
  checkBrandLayouts,
  type BrandLayoutCheck,
  type BrandLayoutProblem,
} from '@deckster/kit/catalog';
import {
  BRAND_CODE_SOURCE_PREFIX,
  checkReplacedSlides,
  deckCatalog,
  readSkippedCodeLayouts,
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
 * A data layout of `layouts.ts`.
 */
type DataLayout = LoadedBrand['tokens']['layouts'][number];

/**
 * The index of a layout at the start of a problem's path, such as `layouts[2]`.
 */
const LAYOUT_INDEX_PATTERN = /^layouts\[(\d+)\]/;

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
  // A brand added with `deckster brand add` has no code layouts to find. A data layout that falls
  // back to one the add left out cannot be checked and must not stop the brand from being added.
  const leftOut = new Set(
    code === 'skip' ? (yield* readSkippedCodeLayouts(brand.location.dir))?.names : [],
  );
  // Data layouts that do not fit fail the whole catalog, so the catalog is then loaded without
  // them, for the contracts they are checked against.
  const withData = yield* Effect.result(
    deckCatalog({ root, brand: withoutDataLayouts(brand, leftOut), code }),
  );
  const catalogBrand = Result.isSuccess(withData) ? brand : withoutDataLayouts(brand);
  const found = Result.isSuccess(withData)
    ? withData.success
    : yield* deckCatalog({ root, brand: catalogBrand, code });
  if (code === 'skip') {
    for (const layout of found.local.layouts) {
      leftOut.add(layout.name);
    }
  }

  const base = [...found.index.values()]
    .filter((layout) => !layout.source.startsWith(BRAND_SOURCE_PREFIX))
    .map((layout) => layout.contract);
  const data = checkDataLayouts(layouts, base, leftOut, unavailableDataLayouts(brand, found.local));
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
 * The brand without its data layouts, or without the ones that fall back to a layout that is not
 * there to be checked against.
 *
 * @param brand - The loaded brand.
 * @param leftOut - The names of the code layouts left out; omit it to drop every data layout.
 */
function withoutDataLayouts(brand: LoadedBrand, leftOut?: ReadonlySet<string>): LoadedBrand {
  const layouts =
    leftOut === undefined
      ? []
      : brand.tokens.layouts.filter((layout) => !leftOut.has(layout.fallback));
  return { ...brand, tokens: { ...brand.tokens, layouts } };
}

/**
 * The names of the data layouts whose fallback is a code layout of the brand that did not load.
 * With `load` the catalog reports each as a `layout-fallback-unavailable` problem that names the
 * code layout's reasons, so the check must not report it again as an unknown fallback. When other
 * data layouts do not fit, the catalog is loaded without any data layout and reports none of them,
 * so the fallbacks are matched by name as well; the code layout's own problem is reported either
 * way.
 *
 * @param brand - The loaded brand.
 * @param local - The code layouts of the brand from `deckCatalog`.
 */
function unavailableDataLayouts(brand: LoadedBrand, local: LocalLayouts): ReadonlySet<string> {
  const brandCode = `${BRAND_CODE_SOURCE_PREFIX}${brand.tokens.name}`;
  const loaded = new Set(local.catalogs.map((entry) => entry.ref.file));
  const notLoaded = new Set(
    local.layouts
      .filter((layout) => layout.source === brandCode && !loaded.has(layout.contractFile))
      .map((layout) => layout.name),
  );
  const reported = local.problems.flatMap((problem) =>
    problem.code === 'layout-fallback-unavailable' && problem.layout !== undefined
      ? [problem.layout]
      : [],
  );
  const unfit = brand.tokens.layouts
    .filter((layout) => notLoaded.has(layout.fallback))
    .map((layout) => layout.name);
  return new Set([...reported, ...unfit]);
}

/**
 * Checks the data layouts against the layouts they fall back to. A layout that falls back to a code
 * layout that was left out cannot be checked: it is not an error, and gets a warning. One the
 * catalog left out for a fallback that did not load is not checked either: its problem is reported
 * with the code layout's.
 *
 * @param layouts - The brand's data layouts, in file order.
 * @param base - The contracts a data layout may fall back to.
 * @param leftOut - The names of the code layouts that were left out, never loaded.
 * @param unavailable - The names of the data layouts the catalog left out for a fallback that did
 *   not load.
 */
function checkDataLayouts(
  layouts: readonly DataLayout[],
  base: Parameters<typeof checkBrandLayouts>[1],
  leftOut: ReadonlySet<string>,
  unavailable: ReadonlySet<string>,
): BrandLayoutCheck {
  const checked = layouts.flatMap((layout, index) =>
    leftOut.has(layout.fallback) || unavailable.has(layout.name) ? [] : [{ layout, index }],
  );
  const { errors, warnings } =
    checked.length === 0
      ? { errors: [], warnings: [] }
      : checkBrandLayouts(
          checked.map((entry) => entry.layout),
          base,
        );
  /**
   * The problem with its path pointing at the layout's position in `layouts.ts`, not in the checked
   * subset.
   */
  const original = (problem: BrandLayoutProblem): BrandLayoutProblem => ({
    ...problem,
    path: problem.path.replace(LAYOUT_INDEX_PATTERN, (_match, position: string) => {
      const entry = checked[Number(position)];
      return `layouts[${entry?.index ?? position}]`;
    }),
  });
  const notChecked = layouts.flatMap((layout, index) =>
    leftOut.has(layout.fallback) ? [notCheckedWarning(index, layout)] : [],
  );
  return { errors: errors.map(original), warnings: [...warnings.map(original), ...notChecked] };
}

/**
 * The warning for a data layout whose fallback is a code layout `brand add` left out.
 *
 * @param index - The layout's position in `layouts.ts`.
 * @param layout - The layout.
 */
function notCheckedWarning(index: number, layout: DataLayout): BrandLayoutProblem {
  return {
    path: `layouts[${index}].fallback`,
    message:
      `The layout "${layout.name}" falls back to the code layout "${layout.fallback}", which was ` +
      'left out, so its bindings are not checked.',
    fix:
      `Copy layouts/${layout.fallback}/ from the brand's own repository, then run ` +
      'deckster brand check.',
  };
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
