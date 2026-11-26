import {
  beginTurnGuard,
  resetCodeGate,
  resetTurnGuards,
  turnRecordFile,
} from '@deckster/brand/node';
import { NodeFileSystem } from '@effect/platform-node';
import { expect, layer } from '@effect/vitest';
import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import { deckLocation } from '#decks/deck-paths.ts';
import { discoverDecks, findDeck } from '#decks/discover-decks.ts';
import { loadDeck } from '#decks/load-deck.ts';

/**
 * A fresh workspace folder, removed when the test's scope closes.
 */
const makeWorkspace = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.makeTempDirectoryScoped({ prefix: 'deck-workspace-' });
});

/**
 * Writes a deck whose config exports `config` (TypeScript source) and the given slide files.
 */
const writeDeck = Effect.fn('writeDeck')(function* (
  workspace: string,
  id: string,
  config: string,
  slides: readonly string[] = [],
) {
  const fs = yield* FileSystem.FileSystem;
  const deck = deckLocation(workspace, id);
  yield* fs.makeDirectory(deck.slidesDir, { recursive: true });
  yield* fs.writeFileString(deck.configFile, `export default ${config};\n`);
  for (const slide of slides) {
    yield* fs.writeFileString(path.join(deck.slidesDir, slide), '# Slide\n');
  }
});

/**
 * The message an effect fails with, as `String(error)` prints it.
 */
function failureText(effect: Effect.Effect<unknown, unknown, FileSystem.FileSystem>) {
  return Effect.map(Effect.flip(effect), (error) => String(error));
}

layer(NodeFileSystem.layer)('loadDeck', (it) => {
  it.effect('never runs a config an agent changed while its turn runs', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const workspace = yield* makeWorkspace;
      yield* writeDeck(workspace, 'demo', "{ title: 'Demo', slides: ['a'] }", ['a.mdx']);
      const location = deckLocation(workspace, 'demo');
      const marker = path.join(workspace, 'PWNED.txt');
      const evil = `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)}, 'x');\nexport default { title: 'Owned', slides: ['a'] };\n`;
      try {
        expect((yield* loadDeck(workspace, location)).config.title).toBe('Demo');
        const guard = yield* beginTurnGuard({ workspaceRoot: workspace, deck: 'demo' }, 1);
        yield* fs.writeFileString(location.configFile, evil);
        expect((yield* loadDeck(workspace, location)).config.title).toBe('Demo');
        expect(yield* fs.exists(marker)).toBe(false);
        const outcome = yield* guard.settle;
        expect(outcome.reverted.map((item) => item.path)).toEqual(['decks/demo/deck.config.ts']);
        expect((yield* loadDeck(workspace, location)).config.title).toBe('Demo');
        expect(yield* fs.exists(marker)).toBe(false);
      } finally {
        resetTurnGuards();
        resetCodeGate();
      }
    }),
  );

  it.effect('bypass 5 (restart): finishes a killed turn before the config is imported', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const workspace = yield* makeWorkspace;
      yield* writeDeck(workspace, 'demo', "{ title: 'Demo', slides: ['a'] }", ['a.mdx']);
      const location = deckLocation(workspace, 'demo');
      const marker = path.join(workspace, 'PWNED.txt');
      const evil = `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)}, 'x');\nexport default { title: 'Owned', slides: ['a'] };\n`;
      yield* beginTurnGuard({ workspaceRoot: workspace, deck: 'demo' }, 1);
      yield* fs.writeFileString(location.configFile, evil);
      // The dev server is killed: its guard is gone and its process is not running.
      resetTurnGuards();
      resetCodeGate();
      const record = turnRecordFile(workspace, 'demo');
      const text = yield* fs.readFileString(record);
      yield* fs.writeFileString(record, text.replace(/"pid": \d+/, '"pid": 2147483646'));
      expect((yield* loadDeck(workspace, location)).config.title).toBe('Demo');
      expect(yield* fs.exists(marker)).toBe(false);
      expect(yield* fs.exists(record)).toBe(false);
    }),
  );

  it.effect('loads the config and the listed slides in order', () =>
    Effect.gen(function* () {
      const workspace = yield* makeWorkspace;
      yield* writeDeck(workspace, 'demo', "{ title: 'Demo', slides: ['b', 'a'] }", [
        'a.mdx',
        'b.tsx',
        'c.mdx',
      ]);
      const deck = yield* loadDeck(workspace, deckLocation(workspace, 'demo'));
      expect(deck.config).toEqual({ title: 'Demo', slides: ['b', 'a'] });
      expect(deck.slides.map((slide) => path.relative(workspace, slide.file))).toEqual([
        path.join('decks', 'demo', 'slides', 'b.tsx'),
        path.join('decks', 'demo', 'slides', 'a.mdx'),
      ]);
      expect(deck.warnings).toHaveLength(1);
    }),
  );

  it.effect('names the config file and the fix for invalid fields', () =>
    Effect.gen(function* () {
      const workspace = yield* makeWorkspace;
      yield* writeDeck(workspace, 'demo', "{ title: '', slides: ['Intro Slide'], theme: 'dark' }");
      const error = yield* failureText(loadDeck(workspace, deckLocation(workspace, 'demo')));
      expect(error).toBe(
        [
          'DeckBuildError: Invalid deck config in decks/demo/deck.config.ts:',
          '  - "theme" is not a deck config field.',
          '    Fix: Remove it. Known fields: title, slides, brand, mouseNavigation, duration, deckster.',
          '  - title: Expected a value with a length of at least 1, got "".',
          '    Fix: Give the deck a title, for example `title: "Q4 launch"`.',
          '  - slides[0]: Expected a slide id in kebab-case, such as "request-flow", ' +
            'got "Intro Slide".',
          '    Fix: List slide file names without their extension, in order, for example ' +
            '`slides: ["title", "request-flow"]`.',
        ].join('\n'),
      );
    }),
  );

  it.effect('accepts a duration and rejects one that is not minutes and seconds', () =>
    Effect.gen(function* () {
      const workspace = yield* makeWorkspace;
      yield* writeDeck(workspace, 'demo', "{ title: 'Demo', slides: ['a'], duration: '20m' }", [
        'a.mdx',
      ]);
      const deck = yield* loadDeck(workspace, deckLocation(workspace, 'demo'));
      expect(deck.config.duration).toBe('20m');

      yield* writeDeck(workspace, 'late', "{ title: 'Demo', slides: ['a'], duration: 'soon' }", [
        'a.mdx',
      ]);
      const error = yield* failureText(loadDeck(workspace, deckLocation(workspace, 'late')));
      expect(error).toContain('duration: Expected a duration such as "90s", "20m" or "1m30s"');
      expect(error).toContain('Fix: Write the talk length as minutes and seconds');
    }),
  );

  it.effect('reports listed slides that have no file', () =>
    Effect.gen(function* () {
      const workspace = yield* makeWorkspace;
      yield* writeDeck(workspace, 'demo', "{ title: 'Demo', slides: ['intro'] }", [
        'intro-old.mdx',
      ]);
      const error = yield* failureText(loadDeck(workspace, deckLocation(workspace, 'demo')));
      expect(error).toContain(
        'The slide list does not match the slide files in decks/demo/deck.config.ts',
      );
      expect(error).toContain('Fix: Create slides/intro.mdx or slides/intro.tsx.');
    }),
  );

  it.effect('explains a config without a default export object', () =>
    Effect.gen(function* () {
      const workspace = yield* makeWorkspace;
      yield* writeDeck(workspace, 'demo', "'demo'");
      const error = yield* failureText(loadDeck(workspace, deckLocation(workspace, 'demo')));
      expect(error).toContain('The default export is "demo", not a deck config.');
      expect(error).toContain(
        'Fix: Export the config as `export default defineDeck({ title, slides })`.',
      );
    }),
  );

  it.effect('explains a deck without a slides folder', () =>
    Effect.gen(function* () {
      const workspace = yield* makeWorkspace;
      const deck = deckLocation(workspace, 'demo');
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(deck.dir, { recursive: true });
      yield* fs.writeFileString(
        deck.configFile,
        "export default { title: 'Demo', slides: ['a'] };\n",
      );
      const error = yield* failureText(loadDeck(workspace, deck));
      expect(error).toContain('The deck has no slides/ folder.');
    }),
  );
});

layer(NodeFileSystem.layer)('findDeck', (it) => {
  it.effect('finds decks by folder name and skips folders without a config', () =>
    Effect.gen(function* () {
      const workspace = yield* makeWorkspace;
      yield* writeDeck(workspace, 'hello', "{ title: 'Hello', slides: ['a'] }");
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(path.join(workspace, 'decks', 'drafts'), { recursive: true });
      expect((yield* discoverDecks(workspace)).map((deck) => deck.id)).toEqual(['hello']);
      expect((yield* findDeck(workspace, 'hello')).id).toBe('hello');
    }),
  );

  it.effect('suggests the closest deck for a misspelled name', () =>
    Effect.gen(function* () {
      const workspace = yield* makeWorkspace;
      yield* writeDeck(workspace, 'hello', "{ title: 'Hello', slides: ['a'] }");
      const error = yield* failureText(findDeck(workspace, 'helo'));
      expect(error).toContain('There is no decks/helo/deck.config.ts.');
      expect(error).toContain('Fix: Use "hello".');
    }),
  );

  it.effect('lists the decks that exist when no name is close', () =>
    Effect.gen(function* () {
      const workspace = yield* makeWorkspace;
      yield* writeDeck(workspace, 'hello', "{ title: 'Hello', slides: ['a'] }");
      const error = yield* failureText(findDeck(workspace, 'quarterly'));
      expect(error).toContain('Fix: Use one of: hello; or create decks/quarterly/deck.config.ts.');
    }),
  );
});
