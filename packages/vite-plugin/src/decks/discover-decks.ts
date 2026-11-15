import { fileExists } from '@deckster/brand/node';
import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import { DECK_CONFIG_FILE, DECKS_DIR, deckLocation, type DeckLocation } from '#decks/deck-paths.ts';
import { deckNotFound, type DeckBuildError } from '#errors.ts';
import { suggest } from '#suggest.ts';

/**
 * Lists every deck: each folder under `decks/` that contains a `deck.config.ts`.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @returns Decks sorted by id; an empty list when `decks/` does not exist.
 */
export const discoverDecks = Effect.fn('discoverDecks')(function* (
  workspaceRoot: string,
): Effect.fn.Return<DeckLocation[], never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const decksDir = path.join(workspaceRoot, DECKS_DIR);
  const entries = yield* fs.readDirectoryEntries(decksDir).pipe(Effect.orElseSucceed(() => []));
  const candidates = entries
    .filter((entry) => entry.type === 'Directory')
    .map((entry) => deckLocation(workspaceRoot, entry.name));
  const present = yield* Effect.forEach(candidates, (deck) => fileExists(deck.configFile), {
    concurrency: 'unbounded',
  });
  return candidates.filter((_, index) => present[index]).sort((a, b) => a.id.localeCompare(b.id));
});

/**
 * Finds one deck by folder name.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param id - The deck folder name under `decks/`.
 * @throws DeckBuildError naming the decks that exist, with a "did you mean" fix when one is close.
 */
export const findDeck = Effect.fn('findDeck')(function* (
  workspaceRoot: string,
  id: string,
): Effect.fn.Return<DeckLocation, DeckBuildError, FileSystem.FileSystem> {
  const decks = yield* discoverDecks(workspaceRoot);
  const deck = decks.find((candidate) => candidate.id === id);
  if (deck !== undefined) {
    return deck;
  }

  const ids = decks.map((candidate) => candidate.id);
  const closest = suggest(id, ids);
  const location = deckLocation(workspaceRoot, id);
  return yield* deckNotFound(
    { file: location.dir, displayPath: `${DECKS_DIR}/${id}` },
    {
      message: `There is no ${DECKS_DIR}/${id}/${DECK_CONFIG_FILE}.`,
      fix: deckNotFoundFix(id, ids, closest),
    },
  );
});

/**
 * The fix for an unknown deck: the closest deck name, else the decks that exist, else how to create
 * one.
 *
 * @param id - The deck name that was asked for.
 * @param ids - The decks that exist.
 * @param closest - The closest deck name, if one is close enough.
 */
function deckNotFoundFix(id: string, ids: readonly string[], closest: string | undefined): string {
  if (closest !== undefined) {
    return `Use "${closest}".`;
  }

  const create = `create ${DECKS_DIR}/${id}/${DECK_CONFIG_FILE}`;
  if (ids.length === 0) {
    return `No decks exist yet; ${create}.`;
  }

  return `Use one of: ${ids.join(', ')}; or ${create}.`;
}
