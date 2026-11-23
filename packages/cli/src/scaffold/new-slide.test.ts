import { NodeServices } from '@effect/platform-node';
import { expect, layer } from '@effect/vitest';
import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import { runCaptured } from '#cli.fixture.ts';

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
});
