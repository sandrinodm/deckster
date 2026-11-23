import { FRAMEWORK_ROOT } from '@deckster/brand/node';
import { deckViteConfig, findDeck, loadDeck } from '@deckster/vite-plugin';
import { NodeServices } from '@effect/platform-node';
import { describe, expect, it, layer } from '@effect/vitest';
import { Context, Effect, FileSystem, Layer } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'vite-plus';

import { runCaptured } from '#cli.fixture.ts';
import { cliLayer } from '#cli.ts';
import { lintDeck } from '#lint/run-lint.ts';
import { scratchWorkspace } from '#lint/scratch-workspace.fixture.ts';
import { Workspace } from '#workspace.ts';

const BUILD_TIMEOUT_MS = 120_000;

/**
 * Scratch workspaces live inside this package so `@deckster/engine` resolves from them.
 */
const SCRATCH_ROOT = path.resolve(import.meta.dirname, '../../.tmp-workspaces');

/**
 * A scratch workspace with the root TypeScript config, shared by the tests in this file and removed
 * after the last one.
 */
class Scratch extends Context.Service<Scratch, { readonly root: string }>()('test/Scratch') {
  static readonly layer = Layer.effect(
    Scratch,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(SCRATCH_ROOT, { recursive: true });
      const root = yield* fs.makeTempDirectoryScoped({ directory: SCRATCH_ROOT, prefix: 'new-' });
      yield* fs.copyFile(
        path.join(FRAMEWORK_ROOT, 'tsconfig.base.json'),
        path.join(root, 'tsconfig.base.json'),
      );
      return Scratch.of({ root });
    }),
  );
}

/**
 * Runs `deckster` in the scratch workspace and returns what it printed.
 */
const deck = Effect.fn('deck')(function* (argv: string[]) {
  const { root } = yield* Scratch;
  const { output } = yield* runCaptured(argv, { root });
  return output;
});

layer(Scratch.layer.pipe(Layer.provideMerge(NodeServices.layer)))('deckster new', (it) => {
  it.effect(
    'scaffolds a deck, adds a slide, and the result builds',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const { root: workspace } = yield* Scratch;
        const created = yield* deck(['new', 'my-talk', '--title', 'My talk']);
        expect(created).toContain('decks/my-talk/deck.config.ts');
        expect(created).toContain('Next: run `pnpm install` to link decks/my-talk');
        yield* deck(['new', 'slide', 'my-talk', 'intro', '--layout', 'default']);

        const loaded = yield* loadDeck(workspace, yield* findDeck(workspace, 'my-talk'));
        expect(loaded.slides.map((slide) => slide.id)).toEqual(['title', 'intro']);
        expect(loaded.config.title).toBe('My talk');
        const intro = yield* fs.readFileString(
          path.join(workspace, 'decks/my-talk/slides/intro.mdx'),
        );
        expect(intro).toMatch(/^---\nlayout: default\ntitle: Intro\nbudget: 1m\n---\n/);
        expect(intro).toContain('<Step at={1}>');

        yield* Effect.promise(() =>
          build({
            ...deckViteConfig({ workspaceRoot: workspace, deck: 'my-talk' }),
            logLevel: 'silent',
          }),
        );
        const html = yield* fs.readFileString(
          path.join(workspace, 'decks/my-talk/dist/index.html'),
        );
        expect(html).toContain('<div id="deck-root">');
      }),
    BUILD_TIMEOUT_MS,
  );

  it.effect('starts the deck on the title layout with an explicit brand and a duration', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { root } = yield* Scratch;
      yield* deck(['new', 'timed', '--title', 'Timed talk', '--duration', '20m']);
      const config = yield* fs.readFileString(path.join(root, 'decks/timed/deck.config.ts'));
      expect(config).toContain("title: 'Timed talk',\n  brand: 'default',\n  duration: '20m',");
      const cover = yield* fs.readFileString(path.join(root, 'decks/timed/slides/title.mdx'));
      expect(cover).toMatch(/^---\nlayout: title\ntitle: Timed talk\n---\n/);
      expect(cover).not.toContain('Dana Okafor');
      expect(cover).toContain('<Notes>');
      const loaded = yield* loadDeck(root, yield* findDeck(root, 'timed'));
      expect(loaded.config.duration).toBe('20m');
    }),
  );

  it.effect('refuses a title the title layout cannot hold, a brand it lacks, a bad length', () =>
    Effect.gen(function* () {
      const { root } = yield* Scratch;
      const long = 'A very long title that goes well past what a cover can hold';
      const tooLong = yield* Effect.flip(deck(['new', 'long-title', '--title', long]));
      expect(tooLong.message).toContain(`--title is ${long.length} characters`);
      expect(tooLong.message).toContain('allows a title of at most 36');
      expect(tooLong.message).toContain('Run `deckster new --help` for the usage.');
      const unknownBrand = yield* Effect.flip(deck(['new', 'odd-brand', '--brand', 'nope']));
      expect(unknownBrand.message).toContain('There is no brand "nope". Brands: default.');
      const badLength = yield* Effect.flip(deck(['new', 'odd-time', '--duration', 'soon']));
      expect(badLength.message).toContain('--duration "soon" is not a talk length');
      expect(badLength.message).toContain('`duration: 20m`');
      const fs = yield* FileSystem.FileSystem;
      for (const name of ['long-title', 'odd-brand', 'odd-time']) {
        expect(yield* fs.exists(path.join(root, 'decks', name))).toBe(false);
      }
    }),
  );

  it.effect('refuses to overwrite a deck or slide and says what to do', () =>
    Effect.gen(function* () {
      expect((yield* Effect.flip(deck(['new', 'my-talk']))).message).toContain('already exists');
      expect((yield* Effect.flip(deck(['new', 'slide', 'my-talk', 'intro']))).message).toContain(
        'Pick another id',
      );
      expect((yield* Effect.flip(deck(['new', 'Bad_Name']))).message).toContain('kebab-case');
      for (const argv of [
        ['new', '../evil'],
        ['new', 'slide', 'my-talk', '../../evil'],
        ['new', 'a'.repeat(65)],
      ]) {
        expect((yield* Effect.flip(deck(argv))).message, argv.join(' ')).toContain(
          'must be kebab-case',
        );
      }

      expect(
        (yield* Effect.flip(deck(['new', 'slide', 'my-talk', 'outro', '--layout', 'two-col'])))
          .message,
      ).toContain('There is no layout "two-col". Layouts: default');
    }),
  );
});

describe('a scaffolded deck', () => {
  it.effect(
    'comes out with no lint errors',
    () =>
      Effect.gen(function* () {
        const root = scratchWorkspace('deck-new-lint-');
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => fs.rmSync(root, { recursive: true, force: true })),
        );
        yield* runCaptured(
          ['new', 'fresh', '--title', 'Fresh start', '--brand', 'nocturne', '--duration', '5m'],
          { root },
        );
        const report = yield* lintDeck({ deck: 'fresh', brand: undefined }).pipe(
          Effect.provide(cliLayer(Workspace.at(root))),
        );
        const errors = report.findings.filter((finding) => finding.severity === 'error');
        expect(errors).toEqual([]);
        expect(report.summary.slides).toBe(1);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    BUILD_TIMEOUT_MS,
  );
});
