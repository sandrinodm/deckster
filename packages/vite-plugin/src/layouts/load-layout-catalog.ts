import type { BrandTokens } from '@deckster/brand';
import type { AnyLayoutContract } from '@deckster/engine/layout';

import engineCatalog from '@deckster/engine/catalog';
import { brandLayoutCatalog, checkBrandLayouts } from '@deckster/kit/catalog';
import { Effect, Predicate } from 'effect';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { LayoutProblem } from '#layouts/layout-problem.ts';

import {
  invalidBrandLayouts,
  invalidCodeLayouts,
  invalidLayoutCatalog,
  type DeckBuildError,
  type FileRef,
  type Problem,
} from '#errors.ts';
import { checkContract } from '#layouts/check-contract.ts';
import { BRAND_CODE_SOURCE_PREFIX, type LocalCatalog } from '#layouts/local-layouts.ts';

/**
 * The layout catalogs every deck loads after the engine's own: the kit's.
 */
export const DEFAULT_LAYOUT_CATALOGS: readonly string[] = ['@deckster/kit/catalog'];

/**
 * One layout a deck can use: its contract and the package that provides it.
 */
export type CatalogLayout = {
  /**
   * The layout's contract.
   */
  contract: AnyLayoutContract;

  /**
   * The package that provides it, such as `@deckster/kit`.
   */
  source: string;

  /**
   * The kit layout a brand layout falls back to; set only for layouts whose source is
   * `brand:<name>`.
   */
  fallback?: string;
};

/**
 * Every layout a deck can use, by name, in the order `deckster layouts` lists them.
 */
export type LayoutCatalogIndex = ReadonlyMap<string, CatalogLayout>;

/**
 * Options for {@link loadLayoutCatalog}.
 */
export type LayoutCatalogOptions = {
  /**
   * The deck's brand. Its `layouts` are checked against the other catalogs and appended after them,
   * with the source `brand:<name>`. Without it, only the catalogs load.
   */
  brand?: BrandTokens | undefined;

  /**
   * The absolute path of the brand's `layouts.ts`, so an error names the file; defaults to the
   * conventional `brands/<name>/layouts.ts`, relative.
   */
  layoutsFile?: string | undefined;

  /**
   * The code layouts of the brand and the deck, loaded and checked: `LocalLayouts['catalogs']` from
   * `localLayouts`. The brand's join after the catalog modules and before the brand's data layouts,
   * the deck's last.
   */
  local?: readonly LocalCatalog[] | undefined;
};

/**
 * A layout catalog, with the code layouts that could not join it.
 */
export type MergedLayoutCatalog = {
  /**
   * The layouts by name, without the code layouts whose names clash.
   */
  readonly index: LayoutCatalogIndex;

  /**
   * One `layout-name-clash` problem per code layout left out, on its `contract.ts`.
   */
  readonly clashes: readonly LayoutProblem[];

  /**
   * The names of kit layouts a code layout replaces. Always empty until a contract can say
   * `replaces`.
   */
  readonly replaced: readonly string[];
};

/**
 * Loads the engine's layout catalog and then each catalog module in order, in Node. A later
 * catalog's layout replaces an earlier one of the same name, as the runtime plugins' components do;
 * the replaced layout keeps its place in the order. Each module's default export must be a
 * `defineLayoutCatalog(...)` whose contracts pass the build's checks.
 *
 * The other layouts join in this order, and none of them replaces another: the brand's code
 * layouts, the brand's data layouts (`layouts.ts`, checked against the catalog modules' layouts: a
 * clash with one of them, an unknown fallback, bindings the fallback lacks), then the deck's code
 * layouts.
 *
 * @param specifiers - Catalog modules: bare specifiers resolve from this package, absolute paths
 *   are used as they are.
 * @param options - The deck's brand, whose layouts join the catalog, and the code layouts.
 * @returns The layouts by name.
 * @throws DeckBuildError in the error channel naming the catalog file, for a module that does not
 *   load or does not export a catalog, and for every problem with its contracts; naming the brand's
 *   `layouts.ts` for a brand layout that does not fit its fallback; naming a code layout's
 *   `contract.ts` when its name is taken by a kit or engine layout, by a data layout of the same
 *   brand or, for a deck's layout, by a brand layout. `deckCatalog` reports those clashes as values
 *   instead.
 */
export const loadLayoutCatalog = Effect.fn('loadLayoutCatalog')(function* (
  specifiers: readonly string[] = DEFAULT_LAYOUT_CATALOGS,
  options: LayoutCatalogOptions = {},
): Effect.fn.Return<LayoutCatalogIndex, DeckBuildError> {
  const merged = yield* mergeLayoutCatalog(specifiers, options);
  const [first] = merged.clashes;
  if (first !== undefined) {
    const displayPath = options.local?.find((entry) => entry.ref.file === first.file)?.ref
      .displayPath;
    return yield* invalidCodeLayouts(
      { file: first.file, displayPath: displayPath ?? first.file },
      merged.clashes,
    );
  }

  return merged.index;
});

/**
 * {@link loadLayoutCatalog}, except that a code layout whose name is taken is left out and reported
 * as a `layout-name-clash` problem instead of failing, so the other layouts still load.
 *
 * @param specifiers - Catalog modules, as {@link loadLayoutCatalog} takes them.
 * @param options - The deck's brand and the code layouts.
 * @returns The catalog, the clashes and the replaced kit layouts.
 * @throws DeckBuildError in the error channel, as {@link loadLayoutCatalog} does for catalog
 *   modules and brand data layouts.
 */
export const mergeLayoutCatalog = Effect.fn('mergeLayoutCatalog')(function* (
  specifiers: readonly string[] = DEFAULT_LAYOUT_CATALOGS,
  options: LayoutCatalogOptions = {},
): Effect.fn.Return<MergedLayoutCatalog, DeckBuildError> {
  const layouts = new Map<string, CatalogLayout>();
  const catalogs = [
    { ref: catalogRef('@deckster/engine/catalog'), exported: engineCatalog as unknown },
    ...(yield* Effect.forEach(specifiers, importCatalog)),
  ];
  for (const { ref, exported } of catalogs) {
    for (const layout of yield* readCatalog(exported, ref)) {
      layouts.set(layout.contract.name, layout);
    }
  }

  const { brand } = options;
  const local = options.local ?? [];
  const base = [...layouts.values()];
  const moduleNames = new Set(base.map((layout) => layout.contract.name));
  const dataNames = new Set(brand?.layouts.map((layout) => layout.name));
  const brandCode = local.filter((entry) => entry.source.startsWith(BRAND_CODE_SOURCE_PREFIX));
  const brandClashes = yield* joinCodeLayouts(brandCode, layouts, (layout, entry, taken) =>
    taken === undefined
      ? dataLayoutClash(layout, entry, dataNames, brand)
      : moduleLayoutClash(layout, entry, taken),
  );
  for (const layout of yield* brandDataLayouts(brand, options.layoutsFile, base)) {
    layouts.set(layout.contract.name, layout);
  }

  const deckCode = local.filter((entry) => !entry.source.startsWith(BRAND_CODE_SOURCE_PREFIX));
  const deckClashes = yield* joinCodeLayouts(deckCode, layouts, (layout, entry, taken) => {
    if (taken === undefined) {
      return undefined;
    }

    return moduleNames.has(layout.contract.name)
      ? moduleLayoutClash(layout, entry, taken)
      : brandLayoutClash(layout, entry, taken);
  });
  return { index: layouts, clashes: [...brandClashes, ...deckClashes], replaced: [] };
});

/**
 * Decides whether a code layout may take its name: the problem when it may not.
 */
type ClashCheck = (
  layout: CatalogLayout,
  entry: LocalCatalog,
  taken: CatalogLayout | undefined,
) => LayoutProblem | undefined;

/**
 * Adds code layouts to the catalog, leaving out the ones whose name is taken.
 *
 * @param entries - The loaded contracts.
 * @param layouts - The catalog so far, which the layouts are added to.
 * @param clashOf - The problem for a layout that may not take its name, given the layout that has
 *   the name now.
 * @returns The problems of the layouts left out.
 * @throws DeckBuildError in the error channel for an entry that is not a valid contract.
 */
const joinCodeLayouts = Effect.fn('joinCodeLayouts')(function* (
  entries: readonly LocalCatalog[],
  layouts: Map<string, CatalogLayout>,
  clashOf: ClashCheck,
): Effect.fn.Return<LayoutProblem[], DeckBuildError> {
  const clashes: LayoutProblem[] = [];
  for (const entry of entries) {
    const [layout] = yield* readCatalog(codeCatalog(entry), entry.ref);
    if (layout === undefined) {
      continue;
    }

    const clash = clashOf(layout, entry, layouts.get(layout.contract.name));
    if (clash === undefined) {
      layouts.set(layout.contract.name, layout);
    } else {
      clashes.push(clash);
    }
  }

  return clashes;
});

/**
 * The brand's data layouts (`layouts.ts`) as catalog layouts, each with its fallback, after
 * checking them against the layouts of the catalog modules.
 *
 * @param brand - The deck's brand, when it has one.
 * @param layoutsFile - The absolute path of the brand's `layouts.ts`, when known.
 * @param base - The layouts of the catalog modules, which a data layout falls back to.
 * @returns The layouts; empty without a brand or without data layouts.
 * @throws DeckBuildError in the error channel, naming the brand's `layouts.ts`, for a layout that
 *   clashes with a base layout or does not fit its fallback.
 */
const brandDataLayouts = Effect.fn('brandDataLayouts')(function* (
  brand: BrandTokens | undefined,
  layoutsFile: string | undefined,
  base: readonly CatalogLayout[],
): Effect.fn.Return<CatalogLayout[], DeckBuildError> {
  if (brand === undefined || brand.layouts.length === 0) {
    return [];
  }

  const ref = brandLayoutsRef(brand, layoutsFile);
  const contracts = base.map((layout) => layout.contract);
  const { errors } = checkBrandLayouts(brand.layouts, contracts);
  if (errors.length > 0) {
    return yield* invalidBrandLayouts(
      ref,
      errors.map(({ path: field, message, fix }) => ({ message: `${field}: ${message}`, fix })),
    );
  }

  const exported = brandLayoutCatalog(brand, contracts) as unknown;
  const fallbacks = new Map(brand.layouts.map((layout) => [layout.name, layout.fallback]));
  const layouts = yield* readCatalog(exported, ref, 'brand');
  return layouts.map((layout) => {
    const fallback = fallbacks.get(layout.contract.name);
    return fallback === undefined ? layout : { ...layout, fallback };
  });
});

/**
 * One code layout's contract as the catalog its source provides.
 *
 * @param entry - The loaded contract and where it comes from.
 */
function codeCatalog(entry: LocalCatalog): unknown {
  return { source: entry.source, layouts: [entry.exported] };
}

/**
 * The problem for a code layout named like a layout of a catalog module: the kit's or the engine's.
 * When contracts can say `replaces`, a layout that does replaces the taken one instead.
 *
 * @param layout - The code layout.
 * @param entry - Its contract file.
 * @param taken - The layout that has the name.
 */
function moduleLayoutClash(
  layout: CatalogLayout,
  entry: LocalCatalog,
  taken: CatalogLayout,
): LayoutProblem {
  const name = layout.contract.name;
  return {
    code: 'layout-name-clash',
    file: entry.ref.file,
    layout: name,
    message:
      `The code layout "${name}" (${entry.ref.displayPath}) has the name of a layout from ` +
      `${taken.source}.`,
    fix:
      "Rename the layout's folder and the `name` in its contract and component. A code layout " +
      'cannot replace a kit layout yet.',
  };
}

/**
 * The problem for a brand's code layout named like one of the same brand's data layouts, or
 * `undefined` when the name is free.
 *
 * @param layout - The code layout.
 * @param entry - Its contract file.
 * @param dataNames - The names of the brand's data layouts.
 * @param brand - The brand.
 */
function dataLayoutClash(
  layout: CatalogLayout,
  entry: LocalCatalog,
  dataNames: ReadonlySet<string>,
  brand: BrandTokens | undefined,
): LayoutProblem | undefined {
  const name = layout.contract.name;
  if (brand === undefined || !dataNames.has(name)) {
    return undefined;
  }

  return {
    code: 'layout-name-clash',
    file: entry.ref.file,
    layout: name,
    message:
      `The ${brand.name} brand defines "${name}" twice: as a code layout ` +
      `(${entry.ref.displayPath}) and in brands/${brand.name}/layouts.ts.`,
    fix: 'Rename or remove one of them, so the name means one layout in the brand.',
  };
}

/**
 * The problem for a deck's code layout named like a layout of the deck's brand.
 *
 * @param layout - The deck's code layout.
 * @param entry - Its contract file.
 * @param taken - The brand layout that has the name.
 */
function brandLayoutClash(
  layout: CatalogLayout,
  entry: LocalCatalog,
  taken: CatalogLayout,
): LayoutProblem {
  const name = layout.contract.name;
  return {
    code: 'layout-name-clash',
    file: entry.ref.file,
    layout: name,
    message:
      `The deck layout "${name}" (${entry.ref.displayPath}) has the name of a layout of the ` +
      `deck's brand (${taken.source}).`,
    fix:
      "Rename the deck layout's folder and the `name` in its contract and component. A deck " +
      'layout cannot replace a brand layout.',
  };
}

/**
 * Imports a catalog module and returns its default export.
 *
 * @param specifier - A bare specifier or an absolute path.
 */
const importCatalog = Effect.fn('importCatalog')(function* (
  specifier: string,
): Effect.fn.Return<{ ref: FileRef; exported: unknown }, DeckBuildError> {
  const ref = catalogRef(specifier);
  const loaded = yield* Effect.tryPromise({
    try: (): Promise<unknown> => import(/* @vite-ignore */ pathToFileURL(ref.file).href),
    catch: (error) =>
      invalidLayoutCatalog(ref, [
        {
          message: `Importing it failed: ${error instanceof Error ? error.message : String(error)}`,
          fix:
            'A catalog runs in Node: import only layout contracts and `effect`, never ' +
            'components, JSX or browser code.',
        },
      ]),
  });
  return { ref, exported: Predicate.isObject(loaded) ? loaded.default : undefined };
});

/**
 * Validates a catalog module's default export and its contracts.
 *
 * @param exported - The default export.
 * @param ref - The catalog file.
 * @param kind - Whether the catalog was generated from the brand's regions or loaded as a module.
 */
const readCatalog = Effect.fn('readCatalog')(function* (
  exported: unknown,
  ref: FileRef,
  kind: 'module' | 'brand' = 'module',
): Effect.fn.Return<CatalogLayout[], DeckBuildError> {
  if (
    !Predicate.isObject(exported) ||
    typeof exported.source !== 'string' ||
    !Array.isArray(exported.layouts)
  ) {
    return yield* invalidLayoutCatalog(ref, [
      {
        message: 'The default export is not a layout catalog.',
        fix:
          'Export `defineLayoutCatalog({ source, layouts: [contract, ...] })` as the default ' +
          'export.',
      },
    ]);
  }

  const problems: Problem[] = exported.layouts.flatMap((contract) =>
    checkContract(contract, kind === 'brand'),
  );
  if (problems.length > 0) {
    return yield* invalidLayoutCatalog(ref, problems);
  }

  const source = exported.source;
  // checkContract accepted every entry, so each one is a contract.
  const contracts = exported.layouts as AnyLayoutContract[];
  return contracts.map((contract) => ({ contract, source }));
});

/**
 * The file of a catalog module, for messages and for importing it.
 *
 * @param specifier - A bare specifier or an absolute path.
 */
function catalogRef(specifier: string): FileRef {
  const file = path.isAbsolute(specifier)
    ? specifier
    : fileURLToPath(import.meta.resolve(specifier));
  return { file, displayPath: specifier };
}

/**
 * The brand's `layouts.ts`, for messages.
 *
 * @param brand - The brand.
 * @param file - The absolute path of its `layouts.ts`, when known.
 */
function brandLayoutsRef(brand: BrandTokens, file: string | undefined): FileRef {
  const displayPath = `brands/${brand.name}/layouts.ts`;
  return { file: file ?? displayPath, displayPath };
}
