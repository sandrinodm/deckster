import { NodeServices } from '@effect/platform-node';
import { describe, expect, it, layer } from '@effect/vitest';
import { Context, Effect, FileSystem, Layer } from 'effect';
import path from 'node:path';

import { fakeDeckLayer, pageSlide, type FakeDeck } from '#browser/fake-deck.fixture.ts';
import { cliLayer } from '#cli.ts';
import { collectedPage } from '#lint/snapshot.fixture.ts';
import { takeShots, type ShotOptions } from '#shot/take-shots.ts';
import { Workspace } from '#workspace.ts';

const BROWSER_TEST_TIMEOUT_MS = 120_000;
const PNG_WIDTH_OFFSET = 16;
const PNG_HEIGHT_OFFSET = 20;

/**
 * Step counts of the hello deck, in slide order.
 */
const HELLO_STEP_COUNTS = [1, 4, 2, 1];

/**
 * One output folder for the tests in this file, removed after the last one.
 */
class OutDir extends Context.Service<OutDir, { readonly path: string }>()('test/OutDir') {
  static readonly layer = Layer.effect(
    OutDir,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      return OutDir.of({ path: yield* fs.makeTempDirectoryScoped({ prefix: 'deck-shots-' }) });
    }),
  );
}

/**
 * The pixel size a PNG file declares in its header.
 */
const pngSize = Effect.fn('pngSize')(function* (file: string) {
  const fs = yield* FileSystem.FileSystem;
  const bytes = Buffer.from(yield* fs.readFile(file));
  return {
    width: bytes.readUInt32BE(PNG_WIDTH_OFFSET),
    height: bytes.readUInt32BE(PNG_HEIGHT_OFFSET),
  };
});

/**
 * The names of the files in the output folder, sorted.
 */
const listOutDir = Effect.fn('listOutDir')(function* () {
  const fs = yield* FileSystem.FileSystem;
  const { path: outDir } = yield* OutDir;
  return (yield* fs.readDirectory(outDir)).sort();
});

/**
 * Options for a run over the whole deck into the shared output folder.
 */
const shotOptions = Effect.fn('shotOptions')(function* (overrides: Partial<ShotOptions>) {
  const { path: outDir } = yield* OutDir;
  return {
    deck: 'hello',
    slide: undefined,
    brand: undefined,
    steps: false,
    outDir,
    scale: 1,
    ...overrides,
  } satisfies ShotOptions;
});

/**
 * A two-slide fake deck whose second slide shows a render error.
 */
const BROKEN_DECK: FakeDeck = {
  slides: [
    { page: pageSlide(0, 'title'), steps: [collectedPage()] },
    {
      page: pageSlide(1, 'steps'),
      steps: [collectedPage({ renderError: { file: 'slides/steps.mdx', message: 'boom\nstack' } })],
    },
  ],
  loadErrors: ['early'],
};

describe('takeShots with a fake browser', () => {
  const screenshots: string[] = [];
  const services = Layer.mergeAll(
    fakeDeckLayer(BROKEN_DECK, screenshots),
    OutDir.layer.pipe(Layer.provideMerge(NodeServices.layer)),
    Workspace.layer,
  );

  it.effect('still writes a broken slide, and flags it with its error', () =>
    Effect.gen(function* () {
      const result = yield* takeShots(yield* shotOptions({}));
      expect(result.files.map((file) => [path.basename(file.path), file.error])).toEqual([
        ['01-title.png', null],
        ['02-steps.png', 'boom'],
      ]);
      expect(result.pageErrors).toEqual(['early']);
      expect(screenshots.map((file) => path.basename(file))).toEqual([
        '01-title.png',
        '02-steps.png',
      ]);
    }).pipe(Effect.provide(services)),
  );

  it.effect('names files from the manifest, never from ids the page reports', () =>
    Effect.gen(function* () {
      const { path: outDir } = yield* OutDir;
      const result = yield* takeShots(yield* shotOptions({}));
      expect(result.files.map((file) => path.dirname(file.path))).toEqual([outDir, outDir]);
      expect(result.files.map((file) => path.basename(file.path))).toEqual([
        '01-title.png',
        '02-steps.png',
      ]);
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          fakeDeckLayer({
            slides: [
              { page: pageSlide(0, '../../escape'), steps: [collectedPage()] },
              { page: pageSlide(1, '/tmp/abs'), steps: [collectedPage()] },
            ],
          }),
          OutDir.layer.pipe(Layer.provideMerge(NodeServices.layer)),
          Workspace.layer,
        ),
      ),
    ),
  );

  it.effect('names the valid slides when the slide does not exist', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(takeShots(yield* shotOptions({ slide: 'nope' })));
      expect(error.message).toContain(
        'has no slide "nope".\nUse a slide id or its 1-based number: 1 title, 2 steps.',
      );
    }).pipe(Effect.provide(services)),
  );

  it.effect('fails with the held slides when ready() gives up', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(takeShots(yield* shotOptions({})));
      expect(error._tag).toBe('SlideNotReadyError');
      expect(error.message).toContain('slide 2 "steps" (slides/steps.mdx) is still held');
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          fakeDeckLayer({ ...BROKEN_DECK, held: [2] }),
          OutDir.layer.pipe(Layer.provideMerge(NodeServices.layer)),
          Workspace.layer,
        ),
      ),
    ),
  );

  it.effect('fails with the path and reason when the output folder is inside a file', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { path: outDir } = yield* OutDir;
      const file = path.join(outDir, 'a-file');
      yield* fs.writeFileString(file, '');
      const error = yield* Effect.flip(
        takeShots(yield* shotOptions({ outDir: path.join(file, 'shots') })),
      );
      expect(error._tag).toBe('FileSystemError');
      expect(error.message).toContain(
        `Could not create the output folder ${path.join(file, 'shots')}: a part of the path is a file, not a folder (ENOTDIR).`,
      );
    }).pipe(Effect.provide(services)),
  );
});

layer(
  Layer.mergeAll(OutDir.layer, cliLayer(Workspace.layer)).pipe(
    Layer.provideMerge(NodeServices.layer),
  ),
)('takeShots in Chromium', (it) => {
  it.effect(
    'writes a 1920x1080 PNG for every step of every slide of hello',
    () =>
      Effect.gen(function* () {
        const { files } = yield* takeShots(yield* shotOptions({ steps: true }));
        const expected = HELLO_STEP_COUNTS.reduce((total, count) => total + count, 0);
        expect(files).toHaveLength(expected);
        expect(files.map((file) => path.basename(file.path))).toContain('02-steps.step3.png');
        expect(files.every((file) => file.error === null)).toBe(true);
        for (const file of files) {
          expect(yield* pngSize(file.path)).toEqual({ width: 1920, height: 1080 });
        }

        expect(yield* listOutDir()).toEqual(files.map((file) => path.basename(file.path)).sort());
      }),
    BROWSER_TEST_TIMEOUT_MS,
  );

  it.effect(
    'writes one PNG per slide at the last step in another brand, and removes stale step files',
    () =>
      Effect.gen(function* () {
        const result = yield* takeShots(yield* shotOptions({ brand: 'nocturne' }));
        expect(result.brand).toBe('nocturne');
        expect(result.files.map((file) => path.basename(file.path))).toEqual([
          '01-title.png',
          '02-steps.png',
          '03-live-counter.png',
          '04-closing.png',
        ]);
        expect(yield* listOutDir()).toEqual(
          result.files.map((file) => path.basename(file.path)).sort(),
        );
      }),
    BROWSER_TEST_TIMEOUT_MS,
  );

  it.effect(
    'captures one slide by id and scales the image',
    () =>
      Effect.gen(function* () {
        const { files } = yield* takeShots(yield* shotOptions({ slide: 'closing', scale: 0.5 }));
        expect(files).toHaveLength(1);
        expect(yield* pngSize(files[0]?.path ?? '')).toEqual({ width: 960, height: 540 });
      }),
    BROWSER_TEST_TIMEOUT_MS,
  );
});
