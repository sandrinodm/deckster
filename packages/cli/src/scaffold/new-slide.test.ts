import { NodeServices } from '@effect/platform-node';
import { expect, layer } from '@effect/vitest';
import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import { runCaptured } from '#cli.fixture.ts';
import {
  CODE_BRAND,
  CODE_LAYOUTS_DECK,
  codeLayoutsWorkspace,
  writeThrowingLayout,
} from '#layouts/code-layouts.fixture.ts';

/**
 * Room for the contracts of the brand's and the deck's code layouts to load.
 */
const COMMAND_TEST_TIMEOUT_MS = 120_000;

layer(NodeServices.layer)('deckster new slide', (it) => {
  it.effect('refuses an id that exists with another extension or is already listed', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: 'new-slide-' });
      yield* runCaptured(['new', 'talk', '--title', 'Talk'], { root });
      const slides = path.join(root, 'decks', 'talk', 'slides');
      const config = path.join(root, 'decks', 'talk', 'deck.config.ts');
      yield* fs.writeFileString(path.join(slides, 'extra.tsx'), 'export default () => null;\n');
      const before = yield* fs.readFileString(config);

      const tsx = yield* Effect.flip(runCaptured(['new', 'slide', 'talk', 'extra'], { root }));
      expect(tsx.message).toContain('slides/extra.tsx already exists');

      yield* fs.remove(path.join(slides, 'title.mdx'));
      const listed = yield* Effect.flip(runCaptured(['new', 'slide', 'talk', 'title'], { root }));
      expect(listed.message).toContain('already lists "title"');

      expect(yield* fs.readFileString(config)).toBe(before);
      expect(yield* fs.exists(path.join(slides, 'extra.mdx'))).toBe(false);
    }),
  );

  it.effect(
    'refuses a layout whose code replacement is broken instead of using the kit layout',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const root = yield* codeLayoutsWorkspace();
          writeThrowingLayout(path.join(root, 'brands', CODE_BRAND, 'layouts'), 'title', 'unused');
          const config = path.join(root, 'decks', CODE_LAYOUTS_DECK, 'deck.config.ts');
          const before = yield* fs.readFileString(config);

          const refused = yield* Effect.flip(
            runCaptured(['new', 'slide', CODE_LAYOUTS_DECK, 'intro', '--layout', 'title'], {
              root,
            }),
          );
          expect(refused.message).toContain('The layout "title" cannot be used:');
          expect(refused.message).toContain('the title contract does not load');
          expect(yield* fs.readFileString(config)).toBe(before);
          expect(
            yield* fs.exists(path.join(root, 'decks', CODE_LAYOUTS_DECK, 'slides', 'intro.mdx')),
          ).toBe(false);
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    COMMAND_TEST_TIMEOUT_MS,
  );

  it.effect(
    'writes the layout asked for when the contract example carries another layout line',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const root = yield* codeLayoutsWorkspace();
          yield* runCaptured(['layouts', 'new', 'brief', '--brand', CODE_BRAND], { root });
          const contract = path.join(root, 'brands', CODE_BRAND, 'layouts', 'brief', 'contract.ts');
          yield* fs.writeFileString(
            contract,
            (yield* fs.readFileString(contract)).replace(
              'frontmatter: { title:',
              "frontmatter: { layout: 'content', title:",
            ),
          );

          const added = yield* runCaptured(
            ['new', 'slide', CODE_LAYOUTS_DECK, 'intro', '--layout', 'brief'],
            { root },
          );
          expect(added.code).toBe(0);
          const slide = path.join(root, 'decks', CODE_LAYOUTS_DECK, 'slides', 'intro.mdx');
          const text = yield* fs.readFileString(slide);
          expect(text).toMatch(/^---\nlayout: brief\n/u);
          expect(text).not.toContain('layout: content');
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    COMMAND_TEST_TIMEOUT_MS,
  );
});
