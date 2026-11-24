import { NodeFileSystem } from '@effect/platform-node';
import { expect, layer } from '@effect/vitest';
import { Effect, FileSystem } from 'effect';

import { findDeck } from '#decks/discover-decks.ts';
import { loadDeck } from '#decks/load-deck.ts';
import { FIXTURE_WORKSPACE } from '#layouts/brand-workspace.fixture.ts';
import { slideMetaReader } from '#slides/slide-meta.ts';

layer(NodeFileSystem.layer)('slideMetaReader', (it) => {
  it.effect('reads slides on the code layouts of the deck and its brand', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const location = yield* findDeck(FIXTURE_WORKSPACE, 'code-layouts');
      const deck = yield* loadDeck(FIXTURE_WORKSPACE, location);
      const read = yield* slideMetaReader(FIXTURE_WORKSPACE, deck);
      const layouts: unknown[] = [];
      for (const slide of deck.slides) {
        const meta = yield* read(slide, yield* fs.readFileString(slide.file));
        layouts.push(meta.frontmatter.layout);
      }

      expect(layouts).toEqual(['kpi-wall', 'funnel', 'broken', 'title']);
    }),
  );
});
