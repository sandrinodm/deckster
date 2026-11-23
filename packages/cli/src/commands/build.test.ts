import { expect, it } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import { vi } from 'vite-plus/test';

import { cliError } from '#cli-error.ts';
import { runCaptured } from '#cli.fixture.ts';
import { FIXTURE_WORKSPACE } from '#lint/lint.fixtures.ts';
import { scratchWorkspace } from '#lint/scratch-workspace.fixture.ts';

it.effect(
  'deckster build refuses --include-scratch without --out, where it would change nothing',
  () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(runCaptured(['build', '--include-scratch']));
      expect(error.message).toContain('--include-scratch only applies to the site --out writes');
    }),
);

it.effect('deckster build --help names the zz- convention and --include-scratch', () =>
  Effect.gen(function* () {
    const { output } = yield* runCaptured(['build', '--help']);
    expect(output).toContain('--include-scratch');
    expect(output).toContain('starts with zz-');
  }),
);

vi.mock('#site/build-deck.ts', () => ({
  buildDeck: (_root: string, deck: { dir: string }) =>
    Effect.suspend(() => {
      if (path.basename(deck.dir) === 'broken') {
        return Effect.fail(cliError('Injected build failure'));
      }

      return Effect.sync(() => {
        fs.mkdirSync(path.join(deck.dir, 'dist'), { recursive: true });
        fs.writeFileSync(path.join(deck.dir, 'dist/index.html'), 'built deck');
      });
    }),
}));

vi.mock('#shot/take-shots.ts', () => ({
  takeShots: () => Effect.succeed({ files: [], pageErrors: [] }),
}));

it.effect(
  'build --all ignores valid and invalid DECK values and publishes the complete gallery',
  () =>
    Effect.gen(function* () {
      const root = scratchWorkspace('deck-build-all-');
      for (const name of ['alpha', 'beta', 'zz-scratch']) {
        fs.cpSync(
          path.join(FIXTURE_WORKSPACE, 'decks/over-budget'),
          path.join(root, 'decks', name),
          { recursive: true },
        );
      }

      for (const deck of ['alpha', '../invalid']) {
        const result = yield* runCaptured(['build', '--all', '--out', 'site'], { root }).pipe(
          Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env: { DECK: deck } }))),
        );
        const gallery = fs.readFileSync(path.join(root, 'site/index.html'), 'utf8');
        expect(result.code).toBe(0);
        expect(gallery).toContain('href="alpha/"');
        expect(gallery).toContain('href="beta/"');
        expect(gallery).not.toContain('href="zz-scratch/"');
        expect(result.output).toContain('Leaving out 1 scratch deck');
      }

      yield* runCaptured(['build', '--all', '--out', 'site', '--include-scratch'], { root }).pipe(
        Effect.provide(
          ConfigProvider.layer(ConfigProvider.fromEnv({ env: { DECK: '../invalid' } })),
        ),
      );
      expect(fs.readFileSync(path.join(root, 'site/index.html'), 'utf8')).toContain(
        'href="zz-scratch/"',
      );
      fs.rmSync(path.join(root, 'decks/zz-scratch/dist'), { recursive: true, force: true });
      yield* runCaptured(['build', '--all'], { root }).pipe(
        Effect.provide(
          ConfigProvider.layer(ConfigProvider.fromEnv({ env: { DECK: '../invalid' } })),
        ),
      );
      expect(fs.existsSync(path.join(root, 'decks/zz-scratch/dist/index.html'))).toBe(true);
      fs.rmSync(root, { recursive: true, force: true });
    }),
);

it.effect('build --all retains positional validation before reading DECK', () =>
  Effect.gen(function* () {
    const error = yield* Effect.flip(
      runCaptured(['build', 'hello', '--all']).pipe(
        Effect.provide(
          ConfigProvider.layer(ConfigProvider.fromEnv({ env: { DECK: '../invalid' } })),
        ),
      ),
    );
    expect(error.message).toContain('cannot be combined with "hello"');
  }),
);

it.effect(
  'a failed build preserves the old site and unrelated siblings and removes its own staging',
  () =>
    Effect.gen(function* () {
      const root = scratchWorkspace('deck-build-failure-');
      fs.cpSync(
        path.join(FIXTURE_WORKSPACE, 'decks/over-budget'),
        path.join(root, 'decks/broken'),
        { recursive: true },
      );
      fs.mkdirSync(path.join(root, 'site'));
      fs.writeFileSync(path.join(root, 'site/.deck-site'), 'old site');
      fs.mkdirSync(path.join(root, '.site.staging'));
      fs.writeFileSync(path.join(root, '.site.staging/keep'), 'unrelated');
      fs.mkdirSync(path.join(root, '.site.staging.previous'));
      fs.writeFileSync(path.join(root, '.site.staging.previous/keep'), 'previous unrelated');
      const before = fs.readdirSync(root).sort();
      const error = yield* Effect.flip(runCaptured(['build', 'broken', '--out', 'site'], { root }));
      expect(error.message).toBe('Injected build failure');
      expect(fs.readFileSync(path.join(root, 'site/.deck-site'), 'utf8')).toBe('old site');
      expect(fs.readFileSync(path.join(root, '.site.staging/keep'), 'utf8')).toBe('unrelated');
      expect(fs.readFileSync(path.join(root, '.site.staging.previous/keep'), 'utf8')).toBe(
        'previous unrelated',
      );
      expect(fs.readdirSync(root).sort()).toEqual(before);
      fs.rmSync(root, { recursive: true, force: true });
    }),
);
