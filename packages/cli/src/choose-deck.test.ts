import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import { defaultDeck } from '#choose-deck.ts';

/**
 * Makes a scratch workspace with the named decks; a name ending in `!` is a folder without a
 * config.
 *
 * @param names - The deck folders to create.
 */
const workspaceWith = Effect.fn('workspaceWith')(function* (names: readonly string[]) {
  const fs = yield* FileSystem.FileSystem;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: 'default-deck-' });
  for (const name of names) {
    const folder = path.join(root, 'decks', name.replace('!', ''));
    yield* fs.makeDirectory(folder, { recursive: true });
    if (!name.endsWith('!')) {
      yield* fs.writeFileString(path.join(folder, 'deck.config.ts'), '');
    }
  }

  return root;
});

describe('defaultDeck', () => {
  it.effect('prefers hello', () =>
    Effect.gen(function* () {
      expect(yield* defaultDeck(yield* workspaceWith(['talk', 'hello']))).toBe('hello');
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect('takes the only deck', () =>
    Effect.gen(function* () {
      expect(yield* defaultDeck(yield* workspaceWith(['talk']))).toBe('talk');
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect('ignores folders without a deck config', () =>
    Effect.gen(function* () {
      expect(yield* defaultDeck(yield* workspaceWith(['talk', 'notes!']))).toBe('talk');
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect('falls back to hello when there are several or none', () =>
    Effect.gen(function* () {
      expect(yield* defaultDeck(yield* workspaceWith(['a', 'b']))).toBe('hello');
      expect(yield* defaultDeck(yield* workspaceWith([]))).toBe('hello');
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
