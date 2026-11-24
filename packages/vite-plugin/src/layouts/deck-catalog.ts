import type { LoadedBrand } from '@deckster/brand/node';

import { Effect, type FileSystem } from 'effect';

import type { DeckLocation } from '#decks/deck-paths.ts';
import type { DeckBuildError } from '#errors.ts';

import {
  DEFAULT_LAYOUT_CATALOGS,
  mergeLayoutCatalog,
  type LayoutCatalogIndex,
} from '#layouts/load-layout-catalog.ts';
import { localLayouts, type LocalLayouts } from '#layouts/local-layouts.ts';

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
 * folder that is incomplete, a contract that does not load or is invalid, a version mismatch, and a
 * name that is taken (by a kit or engine layout, by a data layout of the same brand, or by a brand
 * layout when the code layout is the deck's).
 *
 * @param options - The workspace, the brand, the deck and whether to load code.
 * @returns The catalog and the code layouts.
 * @throws DeckBuildError in the error channel for a catalog module that does not load and for brand
 *   data layouts that do not fit their fallbacks, as `loadLayoutCatalog` does. Problems with code
 *   layouts never fail it.
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
  });
  const clashed = new Set(merged.clashes.map((problem) => problem.file));
  const local: LocalLayouts = {
    ...found,
    catalogs: found.catalogs.filter((entry) => !clashed.has(entry.ref.file)),
    replaced: merged.replaced,
    problems: [...found.problems, ...merged.clashes],
  };
  return { index: merged.index, local };
});
