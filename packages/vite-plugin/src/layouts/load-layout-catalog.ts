import type { BrandTokens } from '@deckster/brand';
import type { AnyLayoutContract } from '@deckster/engine/layout';

import engineCatalog from '@deckster/engine/catalog';
import { brandLayoutCatalog, checkBrandLayouts } from '@deckster/kit/catalog';
import { Effect, Predicate } from 'effect';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  invalidBrandLayouts,
  invalidLayoutCatalog,
  type DeckBuildError,
  type FileRef,
  type Problem,
} from '#errors.ts';
import { checkContract } from '#layouts/check-contract.ts';

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
  brand?: BrandTokens;

  /**
   * The absolute path of the brand's `layouts.ts`, so an error names the file; defaults to the
   * conventional `brands/<name>/layouts.ts`, relative.
   */
  layoutsFile?: string | undefined;
};

/**
 * Loads the engine's layout catalog and then each catalog module in order, in Node. A later
 * catalog's layout replaces an earlier one of the same name, as the runtime plugins' components do;
 * the replaced layout keeps its place in the order. Each module's default export must be a
 * `defineLayoutCatalog(...)` whose contracts pass the build's checks.
 *
 * With a brand that has layouts, they are checked against the loaded layouts (a clash with a layout
 * of the catalog, an unknown fallback, bindings the fallback lacks) and appended last, so a brand
 * layout never replaces another.
 *
 * @param specifiers - Catalog modules: bare specifiers resolve from this package, absolute paths
 *   are used as they are.
 * @param options - The deck's brand, whose layouts join the catalog.
 * @returns The layouts by name.
 * @throws DeckBuildError in the error channel naming the catalog file, for a module that does not
 *   load or does not export a catalog, and for every problem with its contracts; naming the brand's
 *   `layouts.ts` for a brand layout that does not fit its fallback.
 */
export const loadLayoutCatalog = Effect.fn('loadLayoutCatalog')(function* (
  specifiers: readonly string[] = DEFAULT_LAYOUT_CATALOGS,
  options: LayoutCatalogOptions = {},
): Effect.fn.Return<LayoutCatalogIndex, DeckBuildError> {
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
  if (brand !== undefined && brand.layouts.length > 0) {
    const ref = brandLayoutsRef(brand, options.layoutsFile);
    const base = [...layouts.values()].map((layout) => layout.contract);
    const { errors } = checkBrandLayouts(brand.layouts, base);
    if (errors.length > 0) {
      return yield* invalidBrandLayouts(
        ref,
        errors.map(({ path: field, message, fix }) => ({ message: `${field}: ${message}`, fix })),
      );
    }

    const exported = brandLayoutCatalog(brand, base) as unknown;
    const fallbacks = new Map(brand.layouts.map((layout) => [layout.name, layout.fallback]));
    for (const layout of yield* readCatalog(exported, ref, 'brand')) {
      const fallback = fallbacks.get(layout.contract.name);
      layouts.set(layout.contract.name, fallback === undefined ? layout : { ...layout, fallback });
    }
  }

  return layouts;
});

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
