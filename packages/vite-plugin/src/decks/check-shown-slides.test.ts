import { NodeFileSystem } from '@effect/platform-node';
import { expect, layer } from '@effect/vitest';
import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import { deckLocation } from '#decks/deck-paths.ts';
import { loadDeck } from '#decks/load-deck.ts';

/**
 * Writes a deck whose slides are the given files (name and source) and loads it, which checks that
 * a slide is shown.
 */
const checkDeck = Effect.fn('checkDeck')(function* (files: Readonly<Record<string, string>>) {
  const fs = yield* FileSystem.FileSystem;
  const workspace = yield* fs.makeTempDirectoryScoped({ prefix: 'deck-shown-' });
  const location = deckLocation(workspace, 'demo');
  yield* fs.makeDirectory(location.slidesDir, { recursive: true });
  const ids = Object.keys(files).map((name) => path.parse(name).name);
  yield* fs.writeFileString(
    location.configFile,
    `export default { title: 'Demo', slides: ${JSON.stringify(ids)} };\n`,
  );
  for (const [name, source] of Object.entries(files)) {
    yield* fs.writeFileString(path.join(location.slidesDir, name), source);
  }

  return yield* loadDeck(workspace, location);
});

const HIDDEN_MDX = '---\nhidden: true\n---\n# Backup\n';
const HIDDEN_TSX =
  'export const frontmatter = { hidden: true };\nexport default function A() { return null; }\n';

layer(NodeFileSystem.layer)('checkShownSlides', (it) => {
  it.effect('accepts a deck with one shown slide among hidden ones', () =>
    Effect.gen(function* () {
      yield* checkDeck({ 'a.mdx': HIDDEN_MDX, 'b.mdx': '# Shown\n', 'c.tsx': HIDDEN_TSX });
    }),
  );

  it.effect('fails a deck whose every slide is hidden, MDX and TSX alike', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(checkDeck({ 'a.mdx': HIDDEN_MDX, 'b.tsx': HIDDEN_TSX }));
      expect(error.message).toContain('decks/demo/deck.config.ts');
      expect(error.message).toContain('Every slide of the deck "demo" has `hidden: true`');
      expect(error.message).toContain(
        'Fix: Show at least one slide: remove `hidden: true` from one of them.',
      );
    }),
  );

  it.effect('leaves a slide with unreadable frontmatter to its own build error', () =>
    Effect.gen(function* () {
      yield* checkDeck({ 'a.mdx': '---\ntitle: [unclosed\n---\n', 'b.mdx': HIDDEN_MDX });
    }),
  );
});
