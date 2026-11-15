import type { AnyLayoutContract } from '@deckster/engine/layout';

import engineCatalog from '@deckster/engine/catalog';
import { Effect, Predicate } from 'effect';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { invalidLayoutCatalog, type DeckBuildError, type FileRef, type Problem } from '#errors.ts';
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
};

/**
 * Every layout a deck can use, by name, in the order `deck layouts` lists them.
 */
export type LayoutCatalogIndex = ReadonlyMap<string, CatalogLayout>;

/**
 * Loads the engine's layout catalog and then each catalog module in order, in Node. A later
 * catalog's layout replaces an earlier one of the same name, as the runtime plugins' components do;
 * the replaced layout keeps its place in the order. Each module's default export must be a
 * `defineLayoutCatalog(...)` whose contracts pass the build's checks.
 *
 * @param specifiers - Catalog modules: bare specifiers resolve from this package, absolute paths
 *   are used as they are.
 * @returns The layouts by name.
 * @throws DeckBuildError in the error channel naming the catalog file, for a module that does not
 *   load or does not export a catalog, and for every problem with its contracts.
 */
export const loadLayoutCatalog = Effect.fn('loadLayoutCatalog')(function* (
  specifiers: readonly string[] = DEFAULT_LAYOUT_CATALOGS,
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
 */
const readCatalog = Effect.fn('readCatalog')(function* (
  exported: unknown,
  ref: FileRef,
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

  const problems: Problem[] = exported.layouts.flatMap(checkContract);
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
