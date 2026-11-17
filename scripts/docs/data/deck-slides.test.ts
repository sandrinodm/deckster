import * as NodeServices from '@effect/platform-node/NodeServices';
import { afterAll, describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import fs from 'node:fs';
import path from 'node:path';

import { readDocsDeck } from '#data/deck-slides.ts';
import { scratchWorkspace } from '#scratch-workspace.fixture.ts';

/**
 * The scratch deck's slides, by file name: each title source the build knows.
 */
const SLIDES: Readonly<Record<string, string>> = {
  'cover.mdx': [
    '---',
    'title: From the frontmatter',
    'layout: title',
    '---',
    '',
    '# Not this',
  ].join('\n'),
  'heading.mdx': [
    '---',
    'surface: inverse',
    '---',
    '',
    '<Notes>',
    '# Not a notes heading',
    '</Notes>',
    '',
    '## From the **first** heading',
  ].join('\n'),
  'bare.mdx': 'Only a paragraph.\n',
  'quoted.mdx': '# It\'s the heading the build "curls"\n',
  'live.tsx': [
    "export const frontmatter = { title: 'From TSX', layout: 'demo' };",
    '',
    'export default function Live() {',
    '  return <p>live</p>;',
    '}',
  ].join('\n'),
  'counter.tsx': [
    'export default function Counter() {',
    "  return <h1>It's a TSX heading</h1>;",
    '}',
  ].join('\n'),
};

const root = scratchWorkspace('docs-slides-');

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

/**
 * Writes the scratch deck, listing its slides in an order that is not alphabetical.
 */
function writeDeck(): void {
  const deckDir = path.join(root, 'decks', 'scratch');
  fs.mkdirSync(path.join(deckDir, 'slides'), { recursive: true });
  fs.writeFileSync(
    path.join(deckDir, 'deck.config.ts'),
    [
      "import { defineDeck } from '@deckster/engine/config';",
      '',
      'export default defineDeck({',
      "  title: 'Scratch',",
      "  brand: 'nocturne',",
      "  slides: ['cover', 'heading', 'bare', 'quoted', 'live', 'counter'],",
      '});',
      '',
    ].join('\n'),
  );
  for (const [name, source] of Object.entries(SLIDES)) {
    fs.writeFileSync(path.join(deckDir, 'slides', name), source);
  }
}

writeDeck();

describe('readDocsDeck', () => {
  it.effect('lists the slides in deck order with the title and layout the build gives them', () =>
    Effect.gen(function* () {
      const deck = yield* readDocsDeck(root, 'scratch');
      expect({ name: deck.name, title: deck.title, brand: deck.brand }).toEqual({
        name: 'scratch',
        title: 'Scratch',
        brand: 'nocturne',
      });
      expect(deck.slides.map(({ source: _source, ...slide }) => slide)).toEqual([
        {
          id: 'cover',
          number: 1,
          title: 'From the frontmatter',
          layout: 'title',
          file: 'decks/scratch/slides/cover.mdx',
        },
        {
          id: 'heading',
          number: 2,
          title: 'From the first heading',
          layout: 'default',
          file: 'decks/scratch/slides/heading.mdx',
        },
        {
          id: 'bare',
          number: 3,
          title: 'bare',
          layout: 'default',
          file: 'decks/scratch/slides/bare.mdx',
        },
        {
          id: 'quoted',
          number: 4,
          title: 'It\u2019s the heading the build \u201Ccurls\u201D',
          layout: 'default',
          file: 'decks/scratch/slides/quoted.mdx',
        },
        {
          id: 'live',
          number: 5,
          title: 'From TSX',
          layout: 'demo',
          file: 'decks/scratch/slides/live.tsx',
        },
        {
          id: 'counter',
          number: 6,
          title: "It's a TSX heading",
          layout: 'default',
          file: 'decks/scratch/slides/counter.tsx',
        },
      ]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('keeps each slide source exactly as written', () =>
    Effect.gen(function* () {
      const deck = yield* readDocsDeck(root, 'scratch');
      for (const slide of deck.slides) {
        expect(slide.source, slide.id).toBe(SLIDES[path.basename(slide.file)]);
      }
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('fails for a deck that does not exist', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(readDocsDeck(root, 'missing'));
      expect(error._tag).toBe('DeckBuildError');
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
