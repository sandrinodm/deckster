import { resetCodeGate, type LoadedBrand } from '@deckster/brand/node';
import { NodeFileSystem } from '@effect/platform-node';
import { expect, layer } from '@effect/vitest';
import { Effect, type FileSystem } from 'effect';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach } from 'vite-plus/test';

import type { DeckBuildError } from '#errors.ts';

import { loadDeckBrand } from '#brand/load-deck-brand.ts';
import { deckLocation } from '#decks/deck-paths.ts';
import { FIXTURE_WORKSPACE } from '#layouts/brand-workspace.fixture.ts';
import { checkReplacedSlides } from '#layouts/check-replaced-slides.ts';
import {
  componentSource,
  defaultReplacementSource,
  scratchRoot,
  writeFiles,
} from '#layouts/layout-workspace.fixture.ts';

/**
 * The fixture brand `fx-brand`, as if its folder were `brands/fx-brand` of a scratch workspace.
 *
 * @param root - The scratch workspace root.
 */
function scratchBrand(
  root: string,
): Effect.Effect<LoadedBrand, DeckBuildError, FileSystem.FileSystem> {
  return loadDeckBrand(FIXTURE_WORKSPACE, 'fx-brand').pipe(
    Effect.map((loaded) => ({
      ...loaded,
      location: { ...loaded.location, dir: path.join(root, 'brands', 'fx-brand') },
    })),
  );
}

/**
 * The files of a deck on a brand, with MDX slides given by their frontmatter lines.
 *
 * @param id - The deck folder name.
 * @param brand - The brand its config names.
 * @param slides - Each slide's frontmatter lines, by slide id.
 */
function deckFiles(
  id: string,
  brand: string,
  slides: Readonly<Record<string, readonly string[]>>,
): Record<string, string> {
  const files: Record<string, string> = {
    [`decks/${id}/deck.config.ts`]: [
      "import { defineDeck } from '@deckster/engine/config';",
      '',
      `export default defineDeck({ title: 'Talk', brand: '${brand}', slides: ${JSON.stringify(Object.keys(slides))} });`,
      '',
    ].join('\n'),
  };
  for (const [slide, lines] of Object.entries(slides)) {
    files[`decks/${id}/slides/${slide}.mdx`] = `---\n${lines.join('\n')}\n---\n\nHello\n`;
  }

  return files;
}

/**
 * A replacement of the kit's `default` that also requires a title, which the kit's does not: its
 * example and limit cases still pass, so only real slides show the difference.
 */
const TITLED_DEFAULT = defaultReplacementSource()
  .replace('  replaces: true,', '  replaces: true,\n  title: { required: true },')
  .replace('frontmatter: {}', "frontmatter: { title: 'Hello' }");

beforeEach(() => {
  resetCodeGate();
});

afterEach(() => {
  resetCodeGate();
});

layer(NodeFileSystem.layer)('checkReplacedSlides', (it) => {
  it.effect('reports each slide of the brand’s decks that does not fit a replacement', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      writeFiles(root, {
        'brands/fx-brand/layouts/default/contract.ts': TITLED_DEFAULT,
        'brands/fx-brand/layouts/default/layout.tsx': componentSource('default'),
        ...deckFiles('talk', 'fx-brand', {
          untitled: ['layout: default'],
          titled: ['layout: default', 'title: Hello'],
          cover: ['layout: title', 'title: Hello'],
          bare: ['budget: 1m'],
        }),
        ...deckFiles('elsewhere', 'fx-other', { untitled: ['layout: default'] }),
      });
      const problems = yield* checkReplacedSlides({ root, brand: yield* scratchBrand(root) });
      expect(
        problems.map((problem) => `${problem.code} ${path.relative(root, problem.file)}`),
      ).toEqual([
        'layout-replace-breaks brands/fx-brand/layouts/default/contract.ts',
        'layout-replace-breaks brands/fx-brand/layouts/default/contract.ts',
      ]);
      expect(problems[1]?.message).toContain('decks/talk/slides/bare.mdx uses the "default"');
      expect(problems[0]?.message).toBe(
        'decks/talk/slides/untitled.mdx uses the "default" layout, which ' +
          'brands/fx-brand/layouts/default/contract.ts replaces, and does not fit the ' +
          "replacement: title is required: the default layout sets it as the slide's headline.",
      );
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect('checks one deck whatever its brand, and finds nothing when every slide fits', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      writeFiles(root, {
        'brands/fx-brand/layouts/default/contract.ts': TITLED_DEFAULT,
        'brands/fx-brand/layouts/default/layout.tsx': componentSource('default'),
        ...deckFiles('talk', 'fx-brand', { titled: ['layout: default', 'title: Hello'] }),
      });
      const brand = yield* scratchBrand(root);
      const deck = deckLocation(root, 'talk');
      expect(yield* checkReplacedSlides({ root, brand, deck })).toEqual([]);
      rmSync(root, { recursive: true, force: true });
    }),
  );
});
