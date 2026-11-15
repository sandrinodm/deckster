import { NodeFileSystem } from '@effect/platform-node';
import { describe, expect, it, layer } from '@effect/vitest';
import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import { deckLocation } from '#decks/deck-paths.ts';
import { permutationProblems, reorderDeck } from '#decks/reorder-deck.ts';

/**
 * A deck config listing three slides, one per line.
 */
const CONFIG = [
  "import { defineDeck } from '@deckster/engine/config';",
  '',
  'export default defineDeck({',
  "  title: 'Demo',",
  '  slides: [',
  "    'one',",
  "    'two',",
  "    'three',",
  '  ],',
  '});',
  '',
].join('\n');

/**
 * Writes a demo deck with three slides in a scratch workspace and returns the workspace.
 */
const makeDeck = Effect.fn('makeDeck')(function* () {
  const fs = yield* FileSystem.FileSystem;
  const workspace = yield* fs.makeTempDirectoryScoped({ prefix: 'reorder-deck-' });
  const deck = deckLocation(workspace, 'demo');
  yield* fs.makeDirectory(deck.slidesDir, { recursive: true });
  yield* fs.writeFileString(deck.configFile, CONFIG);
  for (const id of ['one', 'two', 'three']) {
    yield* fs.writeFileString(path.join(deck.slidesDir, `${id}.mdx`), '# Slide\n');
  }

  return { workspace, deck };
});

layer(NodeFileSystem.layer)('reorderDeck', (it) => {
  it.effect('rewrites the slides list in place and keeps the rest of the file', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const { workspace, deck } = yield* makeDeck();
        yield* reorderDeck(workspace, deck, { slides: ['three', 'one', 'two'] });
        const written = yield* fs.readFileString(deck.configFile);
        expect(written).toBe(
          CONFIG.replace(
            "    'one',\n    'two',\n    'three',",
            "    'three',\n    'one',\n    'two',",
          ),
        );
      }),
    ),
  );

  it.effect('refuses a request that adds, drops or repeats a slide, and writes nothing', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const { workspace, deck } = yield* makeDeck();
        for (const slides of [
          ['one', 'two'],
          ['one', 'two', 'two'],
          ['one', 'two', 'ghost'],
        ]) {
          const error = yield* Effect.flip(reorderDeck(workspace, deck, { slides }));
          expect(error._tag).toBe('DeckBuildError');
        }

        expect(yield* fs.readFileString(deck.configFile)).toBe(CONFIG);
      }),
    ),
  );

  it.effect('refuses a body that is not a list of ids', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { workspace, deck } = yield* makeDeck();
        for (const body of [null, 'x', { slides: 'one' }, { slides: [] }, {}]) {
          const error = yield* Effect.flip(reorderDeck(workspace, deck, body));
          expect(error._tag).toBe('DeckBuildError');
        }
      }),
    ),
  );
});

describe('permutationProblems', () => {
  it('names every missing, unknown and repeated id', () => {
    expect(permutationProblems(['a', 'b'], ['b', 'a'])).toEqual([]);
    expect(permutationProblems(['a', 'b'], ['a', 'x', 'a'])).toEqual([
      '"x" is not a slide of the deck.',
      '"a" is listed twice.',
      '"b" is missing.',
    ]);
  });
});
