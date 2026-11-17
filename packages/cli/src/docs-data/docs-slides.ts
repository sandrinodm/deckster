import { DEFAULT_LAYOUT } from '@deckster/engine/frontmatter';
import {
  deckBrandName,
  findDeck,
  loadDeck,
  slideTitleReader,
  type DeckBuildError,
  type LoadedSlide,
  type SlideTitleReader,
} from '@deckster/vite-plugin';
import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import { cliError, type CliError } from '#cli-error.ts';
import { readSlide } from '#lookbook/lookbook-coverage.ts';

/**
 * The step effect handed to the lookbook's slide reader. Only the frontmatter it reads is used
 * here, so which effect a bare `<Step>` counts as does not matter.
 */
const UNUSED_STEP_EFFECT = '';

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
   * The layout the slide names, or the default layout when it names none.
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
 *   CliError when a slide file cannot be read or parsed.
 */
export const readDocsDeck = Effect.fn('readDocsDeck')(function* (
  root: string,
  name: string,
): Effect.fn.Return<DocsDeck, DeckBuildError | CliError, FileSystem.FileSystem> {
  const deck = yield* loadDeck(root, yield* findDeck(root, name));
  const titleOf = yield* slideTitleReader(root, deck);
  const slides = yield* Effect.forEach(deck.slides, (slide, index) =>
    readDocsSlide(root, titleOf, slide, index + 1),
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
 * @param titleOf - Reads the title the build gives the slide.
 * @param slide - The slide as the deck loader listed it.
 * @param number - Its 1-based position.
 */
const readDocsSlide = Effect.fn('readDocsSlide')(function* (
  root: string,
  titleOf: SlideTitleReader,
  slide: LoadedSlide,
  number: number,
): Effect.fn.Return<DocsSlide, CliError | DeckBuildError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const file = path.relative(root, slide.file).split(path.sep).join('/');
  const source = yield* fs
    .readFileString(slide.file)
    .pipe(Effect.mapError((error) => cliError(`Could not read ${file}: ${error.message}`)));
  const facts = readSlide(slide.fileName, source, UNUSED_STEP_EFFECT);
  if (facts.kind === 'unreadable') {
    return yield* cliError(`Could not parse ${file}: ${facts.problem}`);
  }

  const { layout } = facts.frontmatter;
  return {
    id: slide.id,
    number,
    title: yield* titleOf(slide, source),
    layout: typeof layout === 'string' ? layout : DEFAULT_LAYOUT,
    file,
    source,
  };
});
