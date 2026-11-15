import { writeDeckManifest } from '@deckster/brand/node';
import { Effect, FileSystem, Predicate, Schema } from 'effect';

import { displayPath, type DeckLocation } from '#decks/deck-paths.ts';
import { loadDeck } from '#decks/load-deck.ts';
import { reorderSlideIds, slideListProblem } from '#decks/slide-list-edit.ts';
import { invalidFields, unreadableFile, type DeckBuildError } from '#errors.ts';
import { decodeFields } from '#validation/decode-fields.ts';

/**
 * What a reorder request is called in messages.
 */
const WHAT = 'reorder request';

/**
 * What the deck config is called in messages.
 */
const CONFIG_WHAT = 'deck config';

/**
 * The body of a reorder request: every slide id of the deck, in the new order.
 */
const ReorderRequest = Schema.Struct({
  slides: Schema.NonEmptyArray(Schema.String),
});

/**
 * How to fix each field of a reorder request.
 */
const REORDER_HINTS = {
  /**
   * Fix for a slide list that is missing or not a list of ids.
   */
  slides: 'Send `{ "slides": ["<id>", ...] }` listing every slide id once.',
};

/**
 * Rewrites the `slides` array of a deck's `deck.config.ts` to a new order. The request must list
 * exactly the ids the config lists now, each once, so a reorder can never add, drop or rename a
 * slide. The edit goes through `writeDeckManifest` (a plain config inside the deck, written
 * atomically, kept by the turn guard while an agent turn runs). The dev server watches the config
 * and reloads the page after the write.
 *
 * @param workspaceRoot - The absolute workspace root, for file names in messages.
 * @param location - The deck to edit.
 * @param request - The decoded-from-JSON request body, any value.
 * @throws DeckBuildError in the error channel for a request that is not a permutation of the
 *   config's slide ids, or a config whose `slides` list cannot be edited without losing text.
 */
export const reorderDeck = Effect.fn('reorderDeck')(function* (
  workspaceRoot: string,
  location: DeckLocation,
  request: unknown,
): Effect.fn.Return<void, DeckBuildError, FileSystem.FileSystem> {
  const ref = {
    file: location.configFile,
    displayPath: displayPath(workspaceRoot, location.configFile),
  };
  if (!Predicate.isObject(request)) {
    return yield* unreadableFile(ref, WHAT, {
      message: 'The body is not a JSON object.',
      fix: REORDER_HINTS.slides,
    });
  }

  const { slides } = yield* decodeFields(request, {
    schema: ReorderRequest,
    hints: REORDER_HINTS,
    what: WHAT,
    ref,
  });
  const { config: current } = yield* loadDeck(workspaceRoot, location);
  const problems = permutationProblems(current.slides, slides);
  if (problems.length > 0) {
    return yield* invalidFields(
      ref,
      WHAT,
      problems.map((message) => ({ message, fix: REORDER_HINTS.slides })),
    );
  }

  yield* writeDeckManifest(workspaceRoot, location.id, (config) => {
    const updated = reorderSlideIds(config, slides);
    if (updated !== undefined) {
      return Effect.succeed(updated);
    }

    const reason =
      slideListProblem(config, { rewrite: true }) ?? 'The `slides` list cannot be edited.';
    return invalidFields(ref, CONFIG_WHAT, [
      {
        message: `${reason} It was not rewritten.`,
        fix:
          'Reorder the list by hand, or make it one `slides: [...]` list of quoted ids ' +
          'without comments.',
      },
    ]);
  }).pipe(
    Effect.catchTag('TurnGuardError', (error) => {
      const [message = error.message, fix = ''] = error.message.split('\n');
      return unreadableFile(ref, CONFIG_WHAT, { message, fix });
    }),
  );
});

/**
 * Checks that a reorder request lists the deck's current slide ids, each once.
 *
 * @param current - The ids the config lists now.
 * @param requested - The ids in the request.
 * @returns The problems, empty when the request is a permutation of the current ids.
 */
export function permutationProblems(
  current: readonly string[],
  requested: readonly string[],
): string[] {
  const known = new Set(current);
  const seen = new Set<string>();
  const problems: string[] = [];
  for (const id of requested) {
    if (!known.has(id)) {
      problems.push(`"${id}" is not a slide of the deck.`);
    } else if (seen.has(id)) {
      problems.push(`"${id}" is listed twice.`);
    }

    seen.add(id);
  }

  for (const id of current) {
    if (!seen.has(id)) {
      problems.push(`"${id}" is missing.`);
    }
  }

  return problems;
}
