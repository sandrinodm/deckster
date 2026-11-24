import type { SlideMeta } from '@deckster/engine/manifest';

import { Effect, type FileSystem } from 'effect';

import type { DeckBuildError } from '#errors.ts';

import { deckBrandName } from '#brand/deck-brand-name.ts';
import { loadDeckBrand } from '#brand/load-deck-brand.ts';
import { displayPath } from '#decks/deck-paths.ts';
import { type LoadedDeck, type LoadedSlide } from '#decks/load-deck.ts';
import { DEFAULT_LAYOUT_CATALOGS, loadLayoutCatalog } from '#layouts/load-layout-catalog.ts';
import { slideBrandOf } from '#slides/check-surface.ts';
import {
  DEFAULT_MDX_EXTENSIONS,
  loadMdxExtensions,
  mdxContextOf,
} from '#slides/load-mdx-extensions.ts';
import { readSlideMeta } from '#slides/transform-slide.ts';

/**
 * Reads the `slideMeta` the build gives one slide of a deck from the slide's source.
 */
export type SlideMetaReader = (
  slide: LoadedSlide,
  code: string,
) => Effect.Effect<SlideMeta, DeckBuildError>;

/**
 * What {@link slideMetaReader} loads differently from the build's defaults.
 */
export type SlideMetaOptions = {
  /**
   * The layout catalog modules, as the deck plugin's `layoutCatalogs` option; defaults to
   * {@link DEFAULT_LAYOUT_CATALOGS}.
   */
  layoutCatalogs?: readonly string[];

  /**
   * A brand folder that replaces the deck config's `brand`, as the deck plugin's `brand` option.
   */
  brand?: string;
};

/**
 * Prepares what the build compiles a deck's slides with (the default layout catalogs, the deck's
 * brand and its MDX extensions) and returns a reader that gives each slide the `slideMeta` `deck
 * build` writes: the validated frontmatter with defaults applied (its `layout` is the one the slide
 * renders with), the title (the frontmatter title, else the first heading outside `<Notes>` after
 * the MDX extensions ran, typographic quotes included, else the slide id), the notes and the filled
 * slots. It runs the build's own slide checks, so a slide the build would refuse fails here too.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param deck - The loaded deck.
 * @param options - The plugin's layout catalogs and brand override, when it has them.
 * @returns The reader for the deck's slides.
 * @throws DeckBuildError in the error channel when the layout catalogs, the deck's brand or the MDX
 *   extensions do not load; the reader fails with one for a slide the build would refuse.
 */
export const slideMetaReader = Effect.fn('slideMetaReader')(function* (
  workspaceRoot: string,
  deck: LoadedDeck,
  options: SlideMetaOptions = {},
): Effect.fn.Return<SlideMetaReader, DeckBuildError, FileSystem.FileSystem> {
  const loaded = yield* loadDeckBrand(workspaceRoot, deckBrandName(deck.config, options.brand));
  const { tokens } = loaded;
  const layouts = yield* loadLayoutCatalog(options.layoutCatalogs ?? DEFAULT_LAYOUT_CATALOGS, {
    brand: tokens,
    layoutsFile: loaded.layoutsFile,
  });
  const context = mdxContextOf(workspaceRoot, deck.location.dir, tokens);
  const mdx = yield* loadMdxExtensions(DEFAULT_MDX_EXTENSIONS, context);
  const brand = slideBrandOf(tokens);
  const fallback = { workspaceRoot, brand: tokens.name };
  return (slide, code) =>
    readSlideMeta({
      id: slide.id,
      kind: slide.kind,
      file: slide.file,
      displayPath: displayPath(workspaceRoot, slide.file),
      code,
      layouts,
      brand,
      fallback,
      mdx,
    });
});
