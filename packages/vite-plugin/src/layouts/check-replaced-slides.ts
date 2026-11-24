import type { LoadedBrand } from '@deckster/brand/node';

import { DEFAULT_LAYOUT } from '@deckster/engine/frontmatter';
import { Effect, FileSystem, Predicate, Result } from 'effect';

import type { DeckBuildError, FileRef } from '#errors.ts';
import type { LayoutProblem } from '#layouts/layout-problem.ts';

import { deckBrandName } from '#brand/deck-brand-name.ts';
import { displayPath, type DeckLocation } from '#decks/deck-paths.ts';
import { discoverDecks } from '#decks/discover-decks.ts';
import { loadDeck, type LoadedDeck } from '#decks/load-deck.ts';
import { deckCatalog, type DeckCatalog } from '#layouts/deck-catalog.ts';
import { validateFrontmatter } from '#slides/frontmatter.ts';
import { readSlideFrontmatter } from '#slides/read-slide-layout.ts';

/**
 * Options for {@link checkReplacedSlides}.
 */
export type ReplacedSlidesOptions = {
  /**
   * The absolute workspace root, whose `decks/` are read.
   */
  readonly root: string;

  /**
   * The brand whose decks are checked: every deck whose config names it (or names no brand, for the
   * default brand).
   */
  readonly brand: LoadedBrand;

  /**
   * One deck to check instead of every deck on the brand, such as the deck `layouts check` runs
   * for; it is checked whatever brand it names.
   */
  readonly deck?: DeckLocation | undefined;

  /**
   * The layout catalog modules, as `deckCatalog` takes them.
   */
  readonly specifiers?: readonly string[] | undefined;
};

/**
 * Checks every slide that uses a replaced kit layout against its replacement, the compatibility
 * check's item that needs real decks: a narrowed field type that the replaced layout's example and
 * limit cases do not exercise shows up here. For each deck on the brand (or the one deck given) it
 * loads the deck's catalog with `deckCatalog`, so the brand's and the deck's replacements both
 * count, and validates the frontmatter of each slide on a replaced layout as the build does.
 *
 * Decks whose config does not load are skipped: the build reports them. The build itself fails a
 * slide that does not fit its replacement; this check is for `brand check` and `layouts check`,
 * which look at every deck at once without building any.
 *
 * @param options - The workspace, the brand and, optionally, one deck.
 * @returns One `layout-replace-breaks` problem per slide problem, on the replacement's
 *   `contract.ts` and naming the slide; empty when every slide fits or nothing is replaced.
 * @throws DeckBuildError in the error channel when a deck's catalog does not load (a catalog module
 *   or the brand's data layouts), as `deckCatalog` does.
 */
export const checkReplacedSlides = Effect.fn('checkReplacedSlides')(function* (
  options: ReplacedSlidesOptions,
): Effect.fn.Return<LayoutProblem[], DeckBuildError, FileSystem.FileSystem> {
  const { root, brand } = options;
  const locations = options.deck === undefined ? yield* discoverDecks(root) : [options.deck];
  const problems: LayoutProblem[] = [];
  for (const location of locations) {
    const loaded = yield* Effect.result(loadDeck(root, location));
    if (Result.isFailure(loaded)) {
      continue;
    }

    const deck = loaded.success;
    const isOnBrand = deckBrandName(deck.config) === brand.location.name;
    if (options.deck === undefined && !isOnBrand) {
      continue;
    }

    const catalog = yield* deckCatalog({
      root,
      brand,
      deck: location,
      code: 'load',
      specifiers: options.specifiers,
    });
    problems.push(...(yield* deckProblems(root, deck, catalog)));
  }

  return problems;
});

/**
 * The problems of one deck's slides on replaced layouts.
 *
 * @param root - The absolute workspace root.
 * @param deck - The loaded deck.
 * @param catalog - The deck's catalog, with its replacements.
 */
const deckProblems = Effect.fn('replacedSlideProblems')(function* (
  root: string,
  deck: LoadedDeck,
  catalog: DeckCatalog,
): Effect.fn.Return<LayoutProblem[], never, FileSystem.FileSystem> {
  const replaced = new Set(catalog.local.replaced);
  if (replaced.size === 0) {
    return [];
  }

  const fs = yield* FileSystem.FileSystem;
  const problems: LayoutProblem[] = [];
  for (const slide of deck.slides) {
    const text = yield* fs.readFileString(slide.file).pipe(Effect.orElseSucceed(() => ''));
    const data = readSlideFrontmatter(slide.file, text);
    const layout = Predicate.isObject(data) ? (data.layout ?? DEFAULT_LAYOUT) : undefined;
    if (typeof layout !== 'string' || !replaced.has(layout)) {
      continue;
    }

    const ref = { file: slide.file, displayPath: displayPath(root, slide.file) };
    const validated = yield* Effect.result(validateFrontmatter(data, catalog.index, ref));
    if (Result.isFailure(validated)) {
      const contract = contractOf(catalog, layout) ?? ref;
      for (const problem of validated.failure.problems) {
        problems.push({
          code: 'layout-replace-breaks',
          file: contract.file,
          layout,
          message:
            `${ref.displayPath} uses the "${layout}" layout, which ${contract.displayPath} ` +
            `replaces, and does not fit the replacement: ${problem.message}`,
          fix: `${problem.fix} Or change the replacement's contract to accept what the slide has.`,
        });
      }
    }
  }

  return problems;
});

/**
 * The `contract.ts` of the code layout that has a name in the catalog.
 *
 * @param catalog - The deck's catalog.
 * @param name - The layout name.
 */
function contractOf(catalog: DeckCatalog, name: string): FileRef | undefined {
  const entry = catalog.local.catalogs.find(
    (candidate) => Predicate.isObject(candidate.exported) && candidate.exported.name === name,
  );
  return entry?.ref;
}
