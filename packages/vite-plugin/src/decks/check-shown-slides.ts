import { Effect, FileSystem, Predicate } from 'effect';

import type { LoadedDeck, LoadedSlide } from '#decks/load-deck.ts';

import { displayPath } from '#decks/deck-paths.ts';
import { noShownSlide, type DeckBuildError } from '#errors.ts';
import { readMdxFrontmatter } from '#slides/frontmatter.ts';
import { readTsxMeta } from '#slides/tsx-meta.ts';

/**
 * Checks that a deck has a slide a talk shows: at least one listed slide that does not say `hidden:
 * true`. It reads only each slide's frontmatter. A slide whose frontmatter cannot be read counts as
 * shown here, since the slide's own build reports what is wrong with it.
 *
 * @param workspaceRoot - The absolute workspace root, for the path in the error.
 * @param deck - The loaded deck.
 * @throws DeckBuildError in the error channel, naming the deck's config, when every slide is
 *   hidden.
 */
export const checkShownSlides = Effect.fn('checkShownSlides')(function* (
  workspaceRoot: string,
  deck: LoadedDeck,
): Effect.fn.Return<void, DeckBuildError, FileSystem.FileSystem> {
  const hidden = yield* Effect.forEach(deck.slides, isHiddenSlide(workspaceRoot));
  if (deck.slides.length > 0 && hidden.every(Boolean)) {
    return yield* noShownSlide(
      {
        file: deck.location.configFile,
        displayPath: displayPath(workspaceRoot, deck.location.configFile),
      },
      deck.location.id,
    );
  }
});

/**
 * Builds the check that reads one slide's frontmatter and says whether it is hidden.
 *
 * @param workspaceRoot - The absolute workspace root.
 */
function isHiddenSlide(workspaceRoot: string) {
  return Effect.fn('isHiddenSlide')(function* (
    slide: LoadedSlide,
  ): Effect.fn.Return<boolean, never, FileSystem.FileSystem> {
    const fs = yield* FileSystem.FileSystem;
    const ref = { file: slide.file, displayPath: displayPath(workspaceRoot, slide.file) };
    const code = yield* fs.readFileString(slide.file).pipe(Effect.orElseSucceed(() => ''));
    const data =
      slide.kind === 'mdx'
        ? yield* readMdxFrontmatter(code, ref).pipe(
            Effect.map((source) => source.data),
            Effect.orElseSucceed(() => ({})),
          )
        : readTsxFrontmatter(code, ref);
    return Predicate.hasProperty(data, 'hidden') && data.hidden === true;
  });
}

/**
 * The frontmatter literal of a TSX slide, `{}` when the slide cannot be read.
 *
 * @param code - The TSX source.
 * @param ref - The slide file.
 */
function readTsxFrontmatter(code: string, ref: { file: string; displayPath: string }): unknown {
  try {
    return readTsxMeta(code, ref).frontmatter;
  } catch {
    return {};
  }
}
