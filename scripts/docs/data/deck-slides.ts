import {
  deckBrandName,
  findDeck,
  loadDeck,
  slideMetaReader,
  type DeckBuildError,
  type LoadedSlide,
  type SlideMetaReader,
} from '@deckster/vite-plugin';
import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import { docsError, type DocsError } from '#docs-error.ts';

/**
 * One slide of a published deck, as the docs site shows it beside the rendered slide.
 */
export type DocsSlide = {
  /**
   * The slide id: its file name without the extension, and the hash a deck URL takes.
   */
  id: string;

  /**
   * The slide's 1-based position in the deck.
   */
  number: number;

  /**
   * The title the build gives the slide, read with the build's own code: the frontmatter title,
   * else the first heading outside `<Notes>` (in an MDX slide, after the deck's MDX extensions
   * ran), else the id.
   */
  title: string;

  /**
   * The layout the build renders the slide with: the one its frontmatter names, or the default
   * layout when it names none.
   */
  layout: string;

  /**
   * The slide file relative to the workspace, with forward slashes, such as
   * `decks/hello/slides/title.mdx`.
   */
  file: string;

  /**
   * The whole file as written, frontmatter included.
   */
  source: string;
};

/**
 * One published deck: its config and its slides in deck order.
 */
export type DocsDeck = {
  /**
   * The deck folder name under `decks/`.
   */
  name: string;

  /**
   * The deck title from `deck.config.ts`.
   */
  title: string;

  /**
   * The brand the deck renders with: the one its config names, or the default brand.
   */
  brand: string;

  /**
   * The slides in the order `deck.config.ts` lists them.
   */
  slides: DocsSlide[];
};

/**
 * Reads a deck the way the build does (config, slide order and files) and describes each slide for
 * the docs: id, number, title, layout, file and source. Slides are read from their source, not
 * rendered.
 *
 * @param root - The absolute workspace root.
 * @param name - The deck folder name.
 * @returns The deck and its slides in deck order.
 * @throws DeckBuildError in the error channel when the deck does not exist, its config or slide
 *   list is invalid, its brand or MDX extensions do not load, or the build would refuse a slide;
 *   DocsError when a slide file cannot be read.
 */
export const readDocsDeck = Effect.fn('readDocsDeck')(function* (
  root: string,
  name: string,
): Effect.fn.Return<DocsDeck, DeckBuildError | DocsError, FileSystem.FileSystem> {
  const deck = yield* loadDeck(root, yield* findDeck(root, name));
  const metaOf = yield* slideMetaReader(root, deck);
  const slides = yield* Effect.forEach(deck.slides, (slide, index) =>
    readDocsSlide(root, metaOf, slide, index + 1),
  );
  return {
    name,
    title: deck.config.title,
    brand: deckBrandName(deck.config),
    slides,
  };
});

/**
 * Reads one slide file and describes it.
 *
 * @param root - The absolute workspace root.
 * @param metaOf - Reads the `slideMeta` the build gives the slide.
 * @param slide - The slide as the deck loader listed it.
 * @param number - Its 1-based position.
 */
const readDocsSlide = Effect.fn('readDocsSlide')(function* (
  root: string,
  metaOf: SlideMetaReader,
  slide: LoadedSlide,
  number: number,
): Effect.fn.Return<DocsSlide, DocsError | DeckBuildError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const file = path.relative(root, slide.file).split(path.sep).join('/');
  const source = yield* fs
    .readFileString(slide.file)
    .pipe(Effect.mapError((error) => docsError(`Could not read ${file}: ${error.message}`)));
  const meta = yield* metaOf(slide, source);
  return {
    id: slide.id,
    number,
    title: meta.title,
    layout: meta.frontmatter.layout,
    file,
    source,
  };
});
