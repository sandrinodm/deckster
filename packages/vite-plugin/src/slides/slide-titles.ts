import { Effect, type FileSystem } from 'effect';

import type { DeckBuildError } from '#errors.ts';

import { deckBrandName } from '#brand/deck-brand-name.ts';
import { loadDeckBrand } from '#brand/load-deck-brand.ts';
import { displayPath } from '#decks/deck-paths.ts';
import { type LoadedDeck, type LoadedSlide } from '#decks/load-deck.ts';
import { loadLayoutCatalog } from '#layouts/load-layout-catalog.ts';
import {
  DEFAULT_MDX_EXTENSIONS,
  loadMdxExtensions,
  mdxContextOf,
} from '#slides/load-mdx-extensions.ts';
import { readSlideTitle } from '#slides/transform-slide.ts';

/**
 * Reads the title the build gives one slide of a deck from the slide's source.
 */
export type SlideTitleReader = (
  slide: LoadedSlide,
  code: string,
) => Effect.Effect<string, DeckBuildError>;

/**
 * Prepares what the build compiles a deck's slides with (the default layout catalogs, the deck's
 * brand and its MDX extensions) and returns a reader that gives each slide the title `deck build`
 * writes into its `slideMeta`: the frontmatter title, else the first heading outside `<Notes>`
 * after the MDX extensions ran (typographic quotes included), else the slide id. It runs the
 * build's own slide checks, so a slide the build would refuse fails here too.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param deck - The loaded deck.
 * @returns The reader for the deck's slides.
 * @throws DeckBuildError in the error channel when the layout catalogs, the deck's brand or the MDX
 *   extensions do not load; the reader fails with one for a slide the build would refuse.
 */
export const slideTitleReader = Effect.fn('slideTitleReader')(function* (
  workspaceRoot: string,
  deck: LoadedDeck,
): Effect.fn.Return<SlideTitleReader, DeckBuildError, FileSystem.FileSystem> {
  const layouts = yield* loadLayoutCatalog();
  const { tokens } = yield* loadDeckBrand(workspaceRoot, deckBrandName(deck.config));
  const context = mdxContextOf(workspaceRoot, deck.location.dir, tokens);
  const mdx = yield* loadMdxExtensions(DEFAULT_MDX_EXTENSIONS, context);
  const brand = { name: tokens.name, surfaces: Object.keys(tokens.surfaces) };
  return (slide, code) =>
    readSlideTitle({
      id: slide.id,
      kind: slide.kind,
      file: slide.file,
      displayPath: displayPath(workspaceRoot, slide.file),
      code,
      layouts,
      brand,
      mdx,
    });
});
