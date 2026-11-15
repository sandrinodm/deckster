import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem, Layer } from 'effect';
import path from 'node:path';

import { cliLayer } from '#cli.ts';
import { compareShots, POSITION_TOLERANCE, type CompareOptions } from '#diff/compare-shots.ts';
import { fakeComparerLayer, solidPng } from '#diff/diff.fixture.ts';
import { SlideComparer } from '#diff/slide-comparer.ts';
import { Workspace } from '#workspace.ts';

const BROWSER_TEST_TIMEOUT_MS = 120_000;

/**
 * Writes pictures into a folder and compares two such folders.
 *
 * @param before - File name to picture, for the base.
 * @param after - File name to picture, for now.
 * @param overrides - Options other than the folders.
 */
const compareFolders = Effect.fn('compareFolders')(function* (
  before: Record<string, Buffer>,
  after: Record<string, Buffer>,
  overrides: Partial<CompareOptions> = {},
) {
  const fs = yield* FileSystem.FileSystem;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: 'deck-compare-' });
  const dirs = {
    before: path.join(root, 'b'),
    after: path.join(root, 'a'),
    out: path.join(root, 'o'),
  };
  for (const [dir, files] of [
    [dirs.before, before],
    [dirs.after, after],
  ] as const) {
    yield* fs.makeDirectory(dir, { recursive: true });
    for (const [name, picture] of Object.entries(files)) {
      yield* fs.writeFile(path.join(dir, name), picture);
    }
  }

  const slides = yield* compareShots({
    beforeDir: dirs.before,
    afterDir: dirs.after,
    outDir: dirs.out,
    steps: false,
    threshold: 0,
    ...overrides,
  });
  return { slides, out: dirs.out };
});

describe('compareShots with a fake comparer', () => {
  const services = Layer.mergeAll(fakeComparerLayer, NodeServices.layer);

  it.effect('empties only picture folders it made, never other files in --out', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: 'deck-compare-out-' });
      const grey = solidPng(100);
      for (const dir of ['b', 'a']) {
        yield* fs.makeDirectory(path.join(root, dir));
        yield* fs.writeFile(path.join(root, dir, '01-intro.png'), grey);
      }

      const out = path.join(root, 'o');
      yield* fs.makeDirectory(path.join(out, 'before'), { recursive: true });
      yield* fs.writeFileString(path.join(out, 'before', 'thesis.docx'), 'precious');
      const options = {
        beforeDir: path.join(root, 'b'),
        afterDir: path.join(root, 'a'),
        outDir: out,
        steps: false,
        threshold: 0,
      };
      const error = yield* Effect.flip(compareShots(options));
      expect(error.message).toContain('will not empty it');
      expect(yield* fs.readFileString(path.join(out, 'before', 'thesis.docx'))).toBe('precious');

      yield* fs.remove(path.join(out, 'before', 'thesis.docx'));
      yield* compareShots(options);
      yield* compareShots(options);
      expect(yield* fs.readDirectory(path.join(out, 'before'))).toEqual([]);
    }).pipe(Effect.provide(services)),
  );

  it.effect('reports every status and writes pictures only for what differs', () =>
    Effect.gen(function* () {
      const grey = solidPng(100);
      const { slides, out } = yield* compareFolders(
        {
          '01-a.png': grey,
          '02-b.png': grey,
          '03-c.png': grey,
          '04-d.png': grey,
        },
        {
          '01-a.png': grey,
          '02-d.png': grey,
          '03-b.png': solidPng(120),
          '04-e.png': grey,
        },
      );
      expect(slides.map((slide) => [slide.id, slide.status])).toEqual([
        ['a', 'unchanged'],
        ['d', 'moved'],
        ['b', 'changed'],
        ['e', 'added'],
        ['c', 'removed'],
      ]);
      const fs = yield* FileSystem.FileSystem;
      expect((yield* fs.readDirectory(path.join(out, 'compare'))).sort()).toEqual(['03-b.png']);
      expect((yield* fs.readDirectory(path.join(out, 'after'))).sort()).toEqual([
        '03-b.png',
        '04-e.png',
      ]);
      expect((yield* fs.readDirectory(path.join(out, 'before'))).sort()).toEqual([
        '02-b.png',
        '03-c.png',
      ]);
      const changed = slides.find((slide) => slide.id === 'b');
      expect(changed).toMatchObject({ beforeNumber: 2, afterNumber: 3, differenceRatio: 1 });
      expect(changed?.compare).toBe(path.join(out, 'compare', '03-b.png'));
    }).pipe(Effect.scoped, Effect.provide(services)),
  );

  it.effect('compares steps and ignores the other kind of file', () =>
    Effect.gen(function* () {
      const grey = solidPng(100);
      const { slides } = yield* compareFolders(
        { '01-a.step0.png': grey, '01-a.step1.png': grey },
        { '01-a.step0.png': grey, '01-a.step1.png': solidPng(150), '01-a.step2.png': grey },
        { steps: true },
      );
      expect(slides).toHaveLength(1);
      expect(slides[0]?.status).toBe('changed');
      expect(slides[0]?.steps?.map((step) => [step.step, step.status])).toEqual([
        [0, 'unchanged'],
        [1, 'changed'],
        [2, 'added'],
      ]);
    }).pipe(Effect.scoped, Effect.provide(services)),
  );

  it.effect('says to pass --steps when the folder holds only step pictures', () =>
    Effect.gen(function* () {
      const grey = solidPng(100);
      const error = yield* Effect.flip(
        compareFolders({ '01-a.step0.png': grey }, { '01-a.png': grey }),
      );
      expect(error.message).toContain('pass `--steps`');
    }).pipe(Effect.scoped, Effect.provide(services)),
  );

  it.effect('does not report a position-only change below the tolerance', () =>
    Effect.gen(function* () {
      const { slides } = yield* compareFolders(
        { '01-a.png': solidPng(100), '02-b.png': solidPng(100) },
        { '01-b.png': solidPng(100), '02-a.png': solidPng(100) },
        { threshold: POSITION_TOLERANCE },
      );
      expect(slides.map((slide) => slide.status).sort()).toEqual(['moved', 'unchanged']);
    }).pipe(Effect.scoped, Effect.provide(services)),
  );
});

describe('compareShots in Chromium', () => {
  const services = cliLayer(Workspace.layer);

  it.effect(
    'measures a change in small generated pictures and draws the three panels',
    () =>
      Effect.gen(function* () {
        const { slides, out } = yield* compareFolders(
          { '01-a.png': solidPng(255), '02-b.png': solidPng(255) },
          { '01-a.png': solidPng(255, { side: 8, shade: 0 }), '02-b.png': solidPng(255) },
        );
        expect(slides.map((slide) => slide.status)).toEqual(['changed', 'unchanged']);
        expect(slides[0]?.differenceRatio).toBeCloseTo(0.25, 1);
        const fs = yield* FileSystem.FileSystem;
        const picture = Buffer.from(yield* fs.readFile(path.join(out, 'compare', '01-a.png')));
        expect(picture.subarray(1, 4).toString('ascii')).toBe('PNG');
        expect(picture.readUInt32BE(16)).toBeGreaterThan(picture.readUInt32BE(20));
      }).pipe(Effect.scoped, Effect.provide(services), Effect.provide(NodeServices.layer)),
    BROWSER_TEST_TIMEOUT_MS,
  );

  it.effect(
    'treats a change below the threshold as unchanged',
    () =>
      Effect.gen(function* () {
        const { slides } = yield* compareFolders(
          { '01-a.png': solidPng(255) },
          { '01-a.png': solidPng(255, { side: 4, shade: 0 }) },
          { threshold: 0.5 },
        );
        expect(slides[0]?.status).toBe('unchanged');
        expect(slides[0]?.differenceRatio).toBeGreaterThan(0);
      }).pipe(Effect.scoped, Effect.provide(services), Effect.provide(NodeServices.layer)),
    BROWSER_TEST_TIMEOUT_MS,
  );
});

describe('SlideComparer', () => {
  it('is a service the CLI layer provides', () => {
    expect(SlideComparer.key).toBe('cli/SlideComparer');
  });
});
