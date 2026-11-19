import { NodeFileSystem } from '@effect/platform-node';
import { expect, layer } from '@effect/vitest';
import { Deferred, Effect, Fiber, FileSystem, PlatformError } from 'effect';
import path from 'node:path';

import { installBrand } from '#brand-add/install-brand.ts';

const BRAND = 'acme';
const SOURCE = 'gh:acme/brand-kit';
const MARKER = 'notes.md';
const ORIGINAL = 'original brand';
const INCOMING = 'incoming brand';
const EXTERNAL = 'externally created brand';

layer(NodeFileSystem.layer)('installBrand', (it) => {
  for (const component of ['.deck', 'brand-add', BRAND]) {
    it.effect(
      `refuses a linked ${component} transaction directory without deleting its contents`,
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const root = yield* fs.makeTempDirectoryScoped();
          const outside = yield* fs.makeTempDirectoryScoped();
          const components = ['.deck', 'brand-add', BRAND];
          const index = components.indexOf(component);
          const link = path.join(root, 'brands', ...components.slice(0, index + 1));
          const outsideStage = path.join(outside, ...components.slice(index + 1), 'stage');
          yield* writeBrand(outsideStage, ORIGINAL);
          yield* fs.makeDirectory(path.dirname(link), { recursive: true });
          yield* fs.symlink(outside, link);

          const result = yield* install(root, false).pipe(Effect.result);
          expect(yield* fs.readFileString(path.join(outsideStage, MARKER))).toBe(ORIGINAL);
          expect(result._tag).toBe('Failure');
          expect(yield* fs.exists(brandPaths(root).target)).toBe(false);
        }),
    );
  }

  it.effect('supports a brands folder linked to another directory', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      const brands = yield* fs.makeTempDirectoryScoped();
      yield* fs.symlink(brands, path.join(root, 'brands'));

      const result = yield* install(root, false);
      expect(result.replaced).toBe(false);
      expect(yield* fs.readFileString(path.join(brands, BRAND, MARKER))).toBe(INCOMING);
    }),
  );

  it.effect('restores the previous brand after a failed publication', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      const { target, transaction } = brandPaths(root);
      yield* writeBrand(target, ORIGINAL);
      const failing = failRenames(fs, target, { restore: false });
      const error = yield* install(root, true).pipe(
        Effect.provideService(FileSystem.FileSystem, failing),
        Effect.flip,
      );
      expect(error.message).toContain(`Could not install ${target}`);
      expect(yield* fs.readFileString(path.join(target, MARKER))).toBe(ORIGINAL);
      expect(yield* fs.readDirectory(transaction)).toEqual(['lock.sqlite']);
    }),
  );

  it.effect('preserves the backup after a failed restoration and recovers it on retry', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      const { target, transaction, previous } = brandPaths(root);
      yield* writeBrand(target, ORIGINAL);
      const failing = failRenames(fs, target, { restore: true });
      const error = yield* install(root, true).pipe(
        Effect.provideService(FileSystem.FileSystem, failing),
        Effect.flip,
      );
      expect(error.message).toContain(`The previous brand is preserved at ${previous}`);
      expect(yield* fs.readFileString(path.join(previous, MARKER))).toBe(ORIGINAL);
      expect(yield* fs.exists(target)).toBe(false);

      const retry = yield* Effect.flip(install(root, false));
      expect(retry.message).toContain('Pass --force');
      expect(yield* fs.readFileString(path.join(target, MARKER))).toBe(ORIGINAL);
      expect(yield* fs.readDirectory(transaction)).toEqual(['lock.sqlite']);
    }),
  );

  it.effect('leaves both brands intact when recovery finds an unexpected destination', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      const { target, previous } = brandPaths(root);
      yield* writeBrand(target, ORIGINAL);
      const failing = failRenames(fs, target, { restore: true });
      yield* install(root, true).pipe(
        Effect.provideService(FileSystem.FileSystem, failing),
        Effect.flip,
      );
      yield* writeBrand(target, EXTERNAL);
      const retry = yield* Effect.flip(install(root, true));
      expect(retry.message).toContain(`The previous brand is preserved at ${previous}`);
      expect(yield* fs.readFileString(path.join(previous, MARKER))).toBe(ORIGINAL);
      expect(yield* fs.readFileString(path.join(target, MARKER))).toBe(EXTERNAL);
    }),
  );

  it.effect('cleans up staging and releases the lock when preparation is interrupted', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      const { target, transaction } = brandPaths(root);
      const staged = yield* Deferred.make<void>();
      const running = yield* Effect.forkChild(
        installBrand(root, BRAND, { source: SOURCE, force: false }, (stageRoot) =>
          writeBrand(brandPaths(stageRoot).target, INCOMING).pipe(
            Effect.andThen(Deferred.succeed(staged, undefined)),
            Effect.andThen(Effect.never),
          ),
        ),
      );
      yield* Deferred.await(staged);
      yield* Fiber.interrupt(running);
      expect(yield* fs.exists(target)).toBe(false);
      expect(yield* fs.readDirectory(transaction)).toEqual(['lock.sqlite']);
      expect((yield* install(root, false)).replaced).toBe(false);
    }),
  );

  it.effect('refuses replacement without force when the target appears during staging', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      const { target, transaction } = brandPaths(root);
      const error = yield* Effect.flip(
        installBrand(root, BRAND, { source: SOURCE, force: false }, (stageRoot) =>
          writeBrand(brandPaths(stageRoot).target, INCOMING).pipe(
            Effect.andThen(writeBrand(target, EXTERNAL)),
          ),
        ),
      );
      expect(error.message).toContain('Pass --force');
      expect(yield* fs.readFileString(path.join(target, MARKER))).toBe(EXTERNAL);
      expect(yield* fs.readDirectory(transaction)).toEqual(['lock.sqlite']);
    }),
  );
});

function brandPaths(root: string): { target: string; transaction: string; previous: string } {
  const transaction = path.join(root, 'brands', '.deck', 'brand-add', BRAND);
  return {
    target: path.join(root, 'brands', BRAND),
    transaction,
    previous: path.join(transaction, 'previous'),
  };
}

const writeBrand = Effect.fn('writeTestBrand')(function* (dir: string, text: string) {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory(dir, { recursive: true });
  yield* fs.writeFileString(path.join(dir, MARKER), text);
});

function install(root: string, force: boolean) {
  return installBrand(root, BRAND, { source: SOURCE, force }, (stageRoot) =>
    writeBrand(brandPaths(stageRoot).target, INCOMING),
  );
}

function failRenames(
  fs: FileSystem.FileSystem,
  target: string,
  options: { restore: boolean },
): FileSystem.FileSystem {
  return FileSystem.FileSystem.of({
    ...fs,
    rename: (from, to) => {
      const restoring = path.basename(from) === 'previous';
      if (to === target && (!restoring || options.restore)) {
        return Effect.fail(
          PlatformError.systemError({
            _tag: 'PermissionDenied',
            module: 'FileSystem',
            method: 'rename',
            description: 'injected failure',
          }),
        );
      }

      return fs.rename(from, to);
    },
  });
}
