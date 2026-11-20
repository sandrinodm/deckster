import { loadLayoutCatalog, validateFrontmatter } from '@deckster/vite-plugin';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Result } from 'effect';

import { describeCatalog } from '#layouts/list-layouts.ts';

const REF = { file: '/decks/visuals/slides/strategy.mdx', displayPath: 'slides/strategy.mdx' };

describe('strategy canvas frontmatter', () => {
  it.effect(
    'reports each incomplete value curve against its factor count in the normal importer',
    () =>
      Effect.gen(function* () {
        const catalog = yield* loadLayoutCatalog();
        const example = describeCatalog(catalog).layouts.find(
          ({ name }) => name === 'strategy-canvas',
        )?.example;
        expect(example).toBeDefined();
        const invalid = {
          layout: 'strategy-canvas',
          ...example?.frontmatter,
          offer: { name: 'Local lamp shop', levels: [1, 3] },
        };
        const result = yield* Effect.result(validateFrontmatter(invalid, catalog, REF));
        expect(Result.isFailure(result)).toBe(true);
        if (Result.isFailure(result)) {
          expect(result.failure.message).toContain(
            'offer.levels: This value curve has 2 scores for 6 factors.',
          );
        }
      }),
  );
});
