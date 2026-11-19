import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { ConfigProvider, Effect, FileSystem } from 'effect';
import path from 'node:path';

import { defaultDeck } from '#choose-deck.ts';
import { chooseInteractiveDeck } from '#chooser/deck-choice.ts';
import { runCaptured } from '#cli.fixture.ts';

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

describe('chooseInteractiveDeck', () => {
  it.effect('prefers the argument to DECK, and DECK to discovery', () =>
    Effect.gen(function* () {
      const root = yield* workspaceWith(['hello', 'talk']);
      expect(yield* chooseInteractiveDeck(root, 'hello', 'dev')).toEqual({ deck: 'hello' });
      expect(yield* chooseInteractiveDeck(root, undefined, 'dev')).toEqual({ deck: 'talk' });
    }).pipe(
      Effect.scoped,
      Effect.provide([
        NodeServices.layer,
        ConfigProvider.layer(ConfigProvider.fromEnv({ env: { DECK: 'talk' } })),
      ]),
    ),
  );

  it.effect('opens the chooser when hello is one of several discovered decks', () =>
    Effect.gen(function* () {
      const root = yield* workspaceWith(['hello', 'talk', 'scratch!']);
      expect(yield* chooseInteractiveDeck(root, undefined, 'dev')).toEqual({ deck: undefined });
    }).pipe(
      Effect.scoped,
      Effect.provide([
        NodeServices.layer,
        ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} })),
      ]),
    ),
  );

  it.effect('uses the only deck and explains how to create one in an empty workspace', () =>
    Effect.gen(function* () {
      const only = yield* workspaceWith(['talk', 'scratch!']);
      expect(yield* chooseInteractiveDeck(only, undefined, 'dev')).toEqual({ deck: 'talk' });

      const empty = yield* workspaceWith([]);
      const error = yield* Effect.flip(chooseInteractiveDeck(empty, undefined, 'dev'));
      expect(error.message).toContain('new <name>');
    }).pipe(
      Effect.scoped,
      Effect.provide([
        NodeServices.layer,
        ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} })),
      ]),
    ),
  );
});

describe('a deck named by a path', () => {
  it.effect('is refused with the same message by dev, lint, shot and export', () =>
    Effect.gen(function* () {
      for (const command of ['dev', 'lint', 'shot', 'export']) {
        const error = yield* Effect.flip(runCaptured([command, '../x']));
        expect(error.message, command).toBe(
          '"../x" is not a deck name: a deck is named by its folder under decks/, in kebab-case: ' +
            'lowercase letters and digits in words joined by single hyphens, at most 64 ' +
            'characters.\nPass the folder name, not a path, such as `hello`.',
        );
      }
    }),
  );
});
