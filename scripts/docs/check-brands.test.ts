import * as NodeServices from '@effect/platform-node/NodeServices';
import { afterAll, describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import fs from 'node:fs';
import path from 'node:path';

import { assertDocsBrands, checkDocsBrands } from '#check-brands.ts';
import { scratchWorkspace } from '#scratch-workspace.fixture.ts';

const root = scratchWorkspace('docs-brands-');

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

/**
 * Writes a one-slide deck whose config names a brand, or none.
 *
 * @param name - The deck folder name.
 * @param brand - The brand line of the config, or `undefined` for none.
 */
function writeDeck(name: string, brand: string | undefined): void {
  const deckDir = path.join(root, 'decks', name);
  fs.mkdirSync(path.join(deckDir, 'slides'), { recursive: true });
  const brandLine = brand === undefined ? [] : [`  brand: '${brand}',`];
  fs.writeFileSync(
    path.join(deckDir, 'deck.config.ts'),
    [
      "import { defineDeck } from '@deckster/engine/config';",
      '',
      'export default defineDeck({',
      `  title: '${name}',`,
      ...brandLine,
      "  slides: ['only'],",
      '});',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(path.join(deckDir, 'slides', 'only.mdx'), '# Only\n');
}

writeDeck('dark', 'nocturne');
writeDeck('plain', undefined);

describe('checkDocsBrands', () => {
  it.effect('passes when every deck renders with an allowlisted brand', () =>
    checkDocsBrands({ root, decks: ['dark', 'plain'], brands: ['default', 'nocturne'] }).pipe(
      Effect.provide(NodeServices.layer),
    ),
  );

  it.effect('names each deck whose brand, configured or the default, is not allowlisted', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        checkDocsBrands({ root, decks: ['dark', 'plain'], brands: ['kinetic'] }),
      );
      expect(error.message).toContain('decks/dark renders with the brand "nocturne"');
      expect(error.message).toContain('decks/plain renders with the brand "default"');
      expect(error.message).toContain('DOCS_BRANDS in scripts/docs/allowlist.ts');
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

describe('assertDocsBrands', () => {
  it('rejects with a plain Error carrying the message', async () => {
    const failure = await assertDocsBrands({ root, decks: ['dark'], brands: ['default'] }).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain('"nocturne"');
  });
});
