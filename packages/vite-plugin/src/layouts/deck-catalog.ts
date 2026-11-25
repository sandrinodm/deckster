import type { LoadedBrand } from '@deckster/brand/node';

import { Effect, type FileSystem } from 'effect';
import path from 'node:path';

import type { DeckLocation } from '#decks/deck-paths.ts';
import type { DeckBuildError, Problem } from '#errors.ts';

import { readSkippedCodeLayouts, skippedCodeLayoutProblem } from '#layouts/brand-source.ts';
import {
  DEFAULT_LAYOUT_CATALOGS,
  mergeLayoutCatalog,
  type LayoutCatalogIndex,
} from '#layouts/load-layout-catalog.ts';
import { LAYOUTS_DIR, localLayouts, type LocalLayouts } from '#layouts/local-layouts.ts';

/**
 * Options for {@link deckCatalog}.
 */
export type DeckCatalogOptions = {
  /**
   * The absolute workspace root.
   */
  readonly root: string;

  /**
   * The loaded brand: its data layouts (`layouts.ts`) and the code layouts in its folder join the
   * catalog. Without it, no brand layouts are read.
   */
  readonly brand?: LoadedBrand | undefined;

  /**
   * The deck, from `findDeck` or `LoadedDeck.location`: the code layouts in its folder join the
   * catalog. Without it, no deck layouts are read.
   */
  readonly deck?: DeckLocation | undefined;

  /**
   * `load` imports the code layouts' contracts. `skip` never runs the brand's or the deck's code:
   * the code layouts are listed in `local.layouts` and are not in the catalog.
   */
  readonly code: 'load' | 'skip';

  /**
   * The layout catalog modules, as the deck plugin's `layoutCatalogs` option; defaults to
   * `DEFAULT_LAYOUT_CATALOGS`.
   */
  readonly specifiers?: readonly string[] | undefined;
};

/**
 * What {@link deckCatalog} loads.
 */
export type DeckCatalog = {
  /**
   * Every layout the deck can use, by name: the engine's and the kit's, the brand's code layouts,
   * the brand's data layouts, then the deck's code layouts.
   */
  readonly index: LayoutCatalogIndex;

  /**
   * The code layouts found. `catalogs` holds only the ones that are in `index`, and `problems`
   * every reason another one is not, name clashes included.
   */
  readonly local: LocalLayouts;
};

/**
 * Loads every layout a deck, or a brand without a deck, can use: the layout catalog modules, the
 * brand's data layouts and the code layouts of the brand and the deck. Every Node-side caller that
 * needs contracts uses this, so the build, lint, export and `deckster layouts` see the same
 * layouts.
 *
 * A code layout with a problem is left out of the catalog and reported in `local.problems`: a
 * folder that is incomplete, a contract that does not load or is invalid, a version mismatch, a
 * name that is taken (by a kit or engine layout it does not say it replaces, by a data layout of
 * the same brand, or by a brand layout when the code layout is the deck's), and a replacement that
 * would break slides written for the kit layout it replaces. A replacement that joins is listed in
 * `local.replaced`, and its warnings and notes in `local.warnings`. A brand data layout whose
 * fallback is one of the brand's code layouts that is not in the catalog (one that did not load, or
 * that `brand add` left out and is still not in the brand's folder, as its `.deckster-source.json`
 * records) is left out too, even when a kit layout has that name: with `load` it gets a
 * `layout-fallback-unavailable` problem that gives the code layout's reasons, and with `skip` that
 * problem is a warning in `local.warnings`; the rest of the catalog loads either way. Slides on
 * real decks are checked against a replacement by the build, and by `checkReplacedSlides` for every
 * deck of a brand.
 *
 * @param options - The workspace, the brand, the deck and whether to load code.
 * @returns The catalog and the code layouts.
 * @throws DeckBuildError in the error channel for a catalog module that does not load and for brand
 *   data layouts that do not fit their fallbacks (other than a withheld brand code layout), as
 *   `loadLayoutCatalog` does. Problems with code layouts never fail it.
 */
export const deckCatalog = Effect.fn('deckCatalog')(function* (
  options: DeckCatalogOptions,
): Effect.fn.Return<DeckCatalog, DeckBuildError, FileSystem.FileSystem> {
  const { brand } = options;
  const found = yield* localLayouts({
    root: options.root,
    brand: brand?.location,
    deck: options.deck,
    code: options.code,
  });
  const merged = yield* mergeLayoutCatalog(options.specifiers ?? DEFAULT_LAYOUT_CATALOGS, {
    brand: brand?.tokens,
    layoutsFile: brand?.layoutsFile,
    local: found.catalogs,
    // A skipped layout whose folder is back is read from the folder, with its own problems.
    withheld: new Map([
      ...(brand === undefined ? [] : yield* skippedBrandLayouts(found, brand)),
      ...withheldBrandLayouts(found, brand?.location.dir),
    ]),
  });
  const clashed = new Set(merged.clashes.map((problem) => problem.file));
  const isLoaded = options.code === 'load';
  const local: LocalLayouts = {
    ...found,
    catalogs: found.catalogs.filter((entry) => !clashed.has(entry.ref.file)),
    replaced: merged.replaced,
    problems: [...found.problems, ...merged.clashes, ...(isLoaded ? merged.unavailable : [])],
    // With the code skipped on purpose, a data layout on a brand code layout is left out with a
    // warning, so a caller still knows the brand has that name.
    warnings: [
      ...merged.warnings,
      ...(isLoaded
        ? []
        : merged.unavailable.map((problem) => ({ ...problem, level: 'warning' as const }))),
    ],
  };
  return { index: merged.index, local };
});

/**
 * The brand's code layouts that were found but did not load, by name, each with the problems that
 * name it or concern every code layout of the brand (a version mismatch). With the code skipped,
 * that is every brand code layout, with no problems.
 *
 * @param found - The code layouts found.
 * @param brandDir - The absolute brand folder, when there is a brand.
 */
function withheldBrandLayouts(
  found: LocalLayouts,
  brandDir: string | undefined,
): ReadonlyMap<string, readonly Problem[]> {
  if (brandDir === undefined) {
    return new Map();
  }

  const layoutsDir = path.join(brandDir, LAYOUTS_DIR);
  /**
   * Whether a file is in the brand's `layouts/` folder.
   */
  const isBrands = (file: string): boolean => file.startsWith(`${layoutsDir}${path.sep}`);
  const loaded = new Set(found.catalogs.map((entry) => entry.ref.file));
  const shared = found.problems.filter(
    (problem) => problem.layout === undefined && path.dirname(problem.file) === brandDir,
  );
  const names = new Set([
    ...found.layouts
      .filter((layout) => isBrands(layout.contractFile) && !loaded.has(layout.contractFile))
      .map((layout) => layout.name),
    ...found.problems.flatMap((problem) =>
      problem.layout !== undefined && isBrands(problem.file) ? [problem.layout] : [],
    ),
  ]);
  return new Map(
    [...names].map((name) => [
      name,
      [
        ...found.problems.filter((problem) => problem.layout === name && isBrands(problem.file)),
        ...shared,
      ],
    ]),
  );
}

/**
 * The brand's code layouts `brand add` left out and that are still not in the brand's folder, by
 * name, each with a `layout-code-skipped` problem that says so. A layout copied in since is read
 * from its folder like any other, so it is not listed here.
 *
 * @param found - The code layouts found.
 * @param brand - The loaded brand.
 */
const skippedBrandLayouts = Effect.fn('skippedBrandLayouts')(function* (
  found: LocalLayouts,
  brand: LoadedBrand,
): Effect.fn.Return<ReadonlyMap<string, readonly Problem[]>, never, FileSystem.FileSystem> {
  const skipped = yield* readSkippedCodeLayouts(brand.location.dir);
  if (skipped === undefined) {
    return new Map();
  }

  const layoutsDir = path.join(brand.location.dir, LAYOUTS_DIR);
  const present = new Set(
    found.layouts
      .filter((layout) => path.dirname(path.dirname(layout.contractFile)) === layoutsDir)
      .map((layout) => layout.name),
  );
  const missing = skipped.names.filter((name) => !present.has(name));
  return new Map(
    missing.map((name) => [name, [skippedCodeLayoutProblem(name, brand.location.name, skipped)]]),
  );
});
