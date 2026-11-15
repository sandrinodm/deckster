import { NodeFileSystem } from '@effect/platform-node';
import { describe, expect, it, layer } from '@effect/vitest';
import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import { makeTestDeck } from '#node/deck.fixture.ts';
import { screenshotFile } from '#node/feedback-paths.ts';
import { screenshotClip, writeScreenshotFile } from '#vite/comment-screenshots.ts';

/**
 * Stand-in PNG bytes.
 */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

describe('screenshotClip', () => {
  it('keeps context around the element', () => {
    expect(
      screenshotClip({ box: { x: 200, y: 300, width: 400, height: 100 }, region: null }),
    ).toEqual({
      x: 152,
      y: 252,
      width: 496,
      height: 196,
    });
  });

  it('stays inside the canvas', () => {
    expect(
      screenshotClip({ box: { x: 1800, y: 1000, width: 400, height: 200 }, region: null }),
    ).toEqual({ x: 1752, y: 952, width: 168, height: 128 });
  });

  it('shows the whole slide for a region, which is outlined on it', () => {
    const region = { x: 800, y: 400, width: 200, height: 100 };
    expect(screenshotClip({ box: region, region })).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
  });

  it('shows the whole canvas for a comment on the slide', () => {
    expect(screenshotClip({ box: null, region: null })).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
  });
});

layer(NodeFileSystem.layer)('writeScreenshotFile', (it) => {
  it.effect('writes the PNG through a temporary file and leaves nothing else behind', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { deck } = yield* makeTestDeck();
      const file = screenshotFile(deck.dir, 'intro', 'abcd1234') ?? '';
      yield* writeScreenshotFile(deck.dir, file, PNG);
      expect([...(yield* fs.readFile(file))]).toEqual([...PNG]);
      expect(yield* fs.readDirectory(path.dirname(file))).toEqual(['abcd1234.png']);
    }).pipe(Effect.scoped),
  );

  it.effect('screenshot writer through a linked slide folder writes nothing outside the deck', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { root, deck } = yield* makeTestDeck();
      const outside = path.join(root, 'outside');
      yield* fs.makeDirectory(outside);
      yield* fs.makeDirectory(path.join(deck.dir, '.feedback'));
      yield* fs.symlink(outside, path.join(deck.dir, '.feedback', 'intro'));
      const file = screenshotFile(deck.dir, 'intro', 'abcd1234') ?? '';
      const error = yield* Effect.flip(writeScreenshotFile(deck.dir, file, PNG));
      expect(error.message).toContain('symbolic link');
      expect(yield* fs.readDirectory(outside)).toEqual([]);
    }).pipe(Effect.scoped),
  );

  it.effect('screenshot writer replaces a link planted at the PNG instead of following it', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { root, deck } = yield* makeTestDeck();
      const target = path.join(root, 'victim.txt');
      yield* fs.writeFileString(target, 'keep me');
      const file = screenshotFile(deck.dir, 'intro', 'abcd1234') ?? '';
      yield* fs.makeDirectory(path.dirname(file), { recursive: true });
      yield* fs.symlink(target, file);
      const error = yield* Effect.flip(writeScreenshotFile(deck.dir, file, PNG));
      expect(error.message).toContain('symbolic link');
      expect(yield* fs.readFileString(target)).toBe('keep me');
    }).pipe(Effect.scoped),
  );

  it.effect('screenshot writer through a linked .feedback folder writes nothing outside', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { root, deck } = yield* makeTestDeck();
      const outside = path.join(root, 'outside-feedback');
      yield* fs.makeDirectory(outside);
      yield* fs.symlink(outside, path.join(deck.dir, '.feedback'));
      const file = screenshotFile(deck.dir, 'intro', 'abcd1234') ?? '';
      yield* Effect.flip(writeScreenshotFile(deck.dir, file, PNG));
      expect(yield* fs.readDirectory(outside)).toEqual([]);
    }).pipe(Effect.scoped),
  );
});
