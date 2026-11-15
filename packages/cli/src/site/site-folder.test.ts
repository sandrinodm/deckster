import { NodeFileSystem } from '@effect/platform-node';
import { expect, layer } from '@effect/vitest';
import { Deferred, Effect, Fiber, FileSystem, PlatformError } from 'effect';
import path from 'node:path';

import { runCaptured } from '#cli.fixture.ts';
import {
  checkReplaceable,
  checkSiteFolder,
  createSiteTransaction,
  SITE_MARKER,
  swapSite,
} from '#site/site-folder.ts';

layer(NodeFileSystem.layer)('site folder', (it) => {
  it.effect('refuses folders that are, contain or sit inside sources', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* fs.makeDirectory(path.join(root, 'decks', 'hello', 'slides'), { recursive: true });
      yield* fs.makeDirectory(path.join(root, 'brands'), { recursive: true });
      yield* fs.makeDirectory(path.join(root, 'packages'), { recursive: true });
      const unsafe = [
        'decks',
        '.',
        '..',
        'decks/hello',
        'decks/hello/dist',
        'brands',
        'packages/kit',
        path.dirname(root),
        '/',
      ];
      for (const out of unsafe) {
        const error = yield* Effect.flip(checkSiteFolder(root, path.resolve(root, out)));
        expect(error.message, out).toContain('not a safe site folder');
      }

      const ok = yield* checkSiteFolder(root, path.join(root, 'site'));
      expect(ok.endsWith('site')).toBe(true);
    }),
  );

  it.effect('resolves symbolic links before judging a folder', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* fs.makeDirectory(path.join(root, 'decks'), { recursive: true });
      yield* fs.symlink(path.join(root, 'decks'), path.join(root, 'site'));
      const error = yield* Effect.flip(checkSiteFolder(root, path.join(root, 'site')));
      expect(error.message).toContain('`decks/`');
    }),
  );

  it.effect('replaces only an absent, empty or marked folder', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped().pipe(Effect.flatMap(fs.realPath));
      expect(yield* checkReplaceable(path.join(dir, 'none'))).toBe(false);
      expect(yield* checkReplaceable(dir)).toBe(true);
      yield* fs.writeFileString(path.join(dir, 'precious.txt'), 'keep');
      const error = yield* Effect.flip(checkReplaceable(dir));
      expect(error.message).toContain('not replaced');
      yield* fs.writeFileString(path.join(dir, SITE_MARKER), '');
      expect(yield* checkReplaceable(dir)).toBe(true);
    }),
  );

  it.effect('swaps the new site in and drops the old one', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped().pipe(Effect.flatMap(fs.realPath));
      const out = path.join(dir, 'site');
      const transaction = yield* createSiteTransaction(out);
      const staging = transaction.staging;
      yield* fs.makeDirectory(out);
      yield* fs.writeFileString(path.join(out, 'old.html'), 'old');
      yield* fs.writeFileString(path.join(out, SITE_MARKER), '');
      yield* fs.makeDirectory(staging);
      yield* fs.writeFileString(path.join(staging, 'new.html'), 'new');
      yield* swapSite(transaction, out, dir);
      expect(yield* fs.readDirectory(out)).toEqual(['new.html']);
      expect(yield* fs.exists(transaction.directory)).toBe(false);
    }),
  );

  it.effect(
    'never touches predictable staging siblings or links while creating a transaction',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped().pipe(Effect.flatMap(fs.realPath));
        const out = path.join(dir, 'site');
        const sentinel = path.join(dir, 'sentinel');
        yield* fs.makeDirectory(sentinel);
        yield* fs.writeFileString(path.join(sentinel, 'keep'), 'precious');
        yield* fs.symlink(sentinel, path.join(dir, '.site.staging'));
        yield* fs.makeDirectory(path.join(dir, '.site.staging.previous'));
        yield* fs.writeFileString(path.join(dir, '.site.staging.previous', 'keep'), 'previous');
        const first = yield* createSiteTransaction(out);
        const second = yield* createSiteTransaction(out);
        expect(first.directory).not.toBe(second.directory);
        yield* fs.makeDirectory(first.staging);
        yield* fs.writeFileString(path.join(first.staging, 'new.html'), 'new');
        yield* swapSite(first, out, dir);
        expect(yield* fs.readFileString(path.join(sentinel, 'keep'))).toBe('precious');
        expect((yield* fs.lstat(path.join(dir, '.site.staging'))).type).toBe('SymbolicLink');
        expect(yield* fs.readFileString(path.join(dir, '.site.staging.previous', 'keep'))).toBe(
          'previous',
        );
      }),
  );

  it.effect('refuses files, symbolic links and linked site markers as destinations', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped().pipe(Effect.flatMap(fs.realPath));
      const file = path.join(dir, 'file');
      yield* fs.writeFileString(file, 'keep');
      const linked = path.join(dir, 'linked');
      yield* fs.symlink(dir, linked);
      const marked = path.join(dir, 'marked');
      yield* fs.makeDirectory(marked);
      yield* fs.symlink(file, path.join(marked, SITE_MARKER));
      for (const out of [file, linked, marked]) {
        const error = yield* Effect.flip(checkReplaceable(out));
        expect(error.message).toContain('not replaced');
      }

      expect(yield* fs.readFileString(file)).toBe('keep');
    }),
  );

  it.effect('rechecks a destination populated while the site was being built', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped().pipe(Effect.flatMap(fs.realPath));
      const out = path.join(dir, 'site');
      expect(yield* checkReplaceable(out)).toBe(false);
      const transaction = yield* createSiteTransaction(out);
      yield* fs.makeDirectory(transaction.staging);
      yield* fs.makeDirectory(out);
      yield* fs.writeFileString(path.join(out, 'keep'), 'arrived during build');
      const error = yield* Effect.flip(swapSite(transaction, out, dir));
      expect(error.message).toContain('not replaced');
      expect(yield* fs.readFileString(path.join(out, 'keep'))).toBe('arrived during build');
    }),
  );

  it.effect('restores the previous site when publishing fails', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped().pipe(Effect.flatMap(fs.realPath));
      const out = path.join(dir, 'site');
      yield* fs.makeDirectory(out);
      yield* fs.writeFileString(path.join(out, SITE_MARKER), 'old');
      const transaction = yield* createSiteTransaction(out);
      yield* fs.makeDirectory(transaction.staging);
      const failing = FileSystem.FileSystem.of({
        ...fs,
        rename: (from, to) =>
          from === transaction.staging
            ? Effect.fail(operationFailure('rename'))
            : fs.rename(from, to),
      });
      const error = yield* Effect.flip(swapSite(transaction, out, dir)).pipe(
        Effect.provideService(FileSystem.FileSystem, failing),
      );
      expect(error.message).toContain('replace the site folder');
      expect(yield* fs.readFileString(path.join(out, SITE_MARKER))).toBe('old');
      expect(yield* fs.exists(transaction.directory)).toBe(false);
    }),
  );

  it.effect('preserves and names the recovery folder when publishing and restoration fail', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped().pipe(Effect.flatMap(fs.realPath));
      const out = path.join(dir, 'site');
      yield* fs.makeDirectory(out);
      yield* fs.writeFileString(path.join(out, SITE_MARKER), 'old');
      const transaction = yield* createSiteTransaction(out);
      yield* fs.makeDirectory(transaction.staging);
      yield* fs.writeFileString(path.join(transaction.staging, 'new.html'), 'new');
      const failing = FileSystem.FileSystem.of({
        ...fs,
        rename: (from, to) =>
          from === out ? fs.rename(from, to) : Effect.fail(operationFailure('rename')),
      });
      const error = yield* Effect.flip(swapSite(transaction, out, dir)).pipe(
        Effect.provideService(FileSystem.FileSystem, failing),
      );
      expect(error.message).toContain(transaction.previous);
      expect(yield* fs.readFileString(path.join(transaction.previous, SITE_MARKER))).toBe('old');
      expect(yield* fs.readFileString(path.join(transaction.staging, 'new.html'))).toBe('new');
    }),
  );

  it.effect(
    'reports cleanup failure after publishing and preserves the old site for inspection',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped().pipe(Effect.flatMap(fs.realPath));
        const out = path.join(dir, 'site');
        yield* fs.makeDirectory(out);
        yield* fs.writeFileString(path.join(out, SITE_MARKER), 'old');
        const transaction = yield* createSiteTransaction(out);
        yield* fs.makeDirectory(transaction.staging);
        yield* fs.writeFileString(path.join(transaction.staging, 'new.html'), 'new');
        const failing = FileSystem.FileSystem.of({
          ...fs,
          remove: (target, options) =>
            target === transaction.directory
              ? Effect.fail(operationFailure('remove'))
              : fs.remove(target, options),
        });
        const error = yield* Effect.flip(swapSite(transaction, out, dir)).pipe(
          Effect.provideService(FileSystem.FileSystem, failing),
        );
        expect(error.message).toContain(transaction.directory);
        expect(yield* fs.readFileString(path.join(out, 'new.html'))).toBe('new');
        expect(yield* fs.readFileString(path.join(transaction.previous, SITE_MARKER))).toBe('old');
      }),
  );

  it.effect(
    'finishes publication before honoring cancellation after moving the previous site',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped().pipe(Effect.flatMap(fs.realPath));
        const out = path.join(dir, 'site');
        yield* fs.makeDirectory(out);
        yield* fs.writeFileString(path.join(out, SITE_MARKER), 'old');
        const transaction = yield* createSiteTransaction(out);
        yield* fs.makeDirectory(transaction.staging);
        yield* fs.writeFileString(path.join(transaction.staging, 'new.html'), 'new');
        const moved = yield* Deferred.make<void>();
        const publish = yield* Deferred.make<void>();
        const paused = FileSystem.FileSystem.of({
          ...fs,
          rename: (from, to) =>
            from === out
              ? fs
                  .rename(from, to)
                  .pipe(
                    Effect.andThen(Deferred.succeed(moved, undefined)),
                    Effect.andThen(Deferred.await(publish)),
                  )
              : fs.rename(from, to),
        });
        const publishing = yield* Effect.forkChild(
          swapSite(transaction, out, dir).pipe(
            Effect.provideService(FileSystem.FileSystem, paused),
          ),
        );
        yield* Deferred.await(moved);
        const cancelling = yield* Effect.forkChild(Fiber.interrupt(publishing));
        yield* Deferred.succeed(publish, undefined);
        yield* Fiber.join(cancelling);
        expect(yield* fs.readFileString(path.join(out, 'new.html'))).toBe('new');
        expect(yield* fs.exists(transaction.directory)).toBe(false);
      }),
  );

  it.effect('deck build --out decks leaves the decks alone and says why', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      const deck = path.join(root, 'decks', 'x');
      yield* fs.makeDirectory(path.join(deck, 'slides'), { recursive: true });
      yield* fs.writeFileString(path.join(deck, 'deck.config.ts'), 'export default {};\n');
      yield* fs.writeFileString(path.join(deck, 'slides', 'a.mdx'), '# a\n');
      const error = yield* Effect.flip(runCaptured(['build', 'x', '--out', 'decks'], { root }));
      expect(error.message).toContain('not a safe site folder');
      expect(yield* fs.exists(path.join(deck, 'slides', 'a.mdx'))).toBe(true);
    }),
  );
});

/**
 * A deterministic platform failure for transaction failure tests.
 */
function operationFailure(method: string): PlatformError.PlatformError {
  return PlatformError.systemError({
    _tag: 'PermissionDenied',
    module: 'FileSystem',
    method,
    description: 'injected failure',
  });
}
