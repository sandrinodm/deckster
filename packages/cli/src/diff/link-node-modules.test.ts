import { NodeFileSystem } from '@effect/platform-node';
import { expect, layer } from '@effect/vitest';
import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import { linkNodeModules } from '#diff/link-node-modules.ts';

layer(NodeFileSystem.layer)('linkNodeModules', (it) => {
  it.effect('links dependencies into a real node_modules folder of the checkout', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const base = yield* fs.makeTempDirectoryScoped();
      const source = path.join(base, 'source');
      const target = path.join(base, 'target');
      yield* fs.makeDirectory(path.join(source, 'node_modules', 'dep'), { recursive: true });
      yield* fs.makeDirectory(target, { recursive: true });
      yield* linkNodeModules(source, target);
      const link = yield* fs.readLink(path.join(target, 'node_modules', 'dep'));
      expect(link).toBe(path.join(source, 'node_modules', 'dep'));
    }),
  );

  it.effect('never creates folders or links through a symlink the base revision committed', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const base = yield* fs.makeTempDirectoryScoped();
      const source = path.join(base, 'source');
      const target = path.join(base, 'target');
      const outside = path.join(base, 'outside');
      yield* fs.makeDirectory(path.join(source, 'packages', 'evil', 'node_modules', 'dep'), {
        recursive: true,
      });
      yield* fs.makeDirectory(path.join(target, 'packages'), { recursive: true });
      yield* fs.makeDirectory(outside);
      yield* fs.symlink(outside, path.join(target, 'packages', 'evil'));

      const error = yield* Effect.flip(linkNodeModules(source, target));
      expect(error.message).toContain('symbolic link at packages/evil');
      expect(yield* fs.readDirectory(outside)).toEqual([]);
    }),
  );

  it.effect('refuses a node_modules folder that is itself a committed symlink', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const base = yield* fs.makeTempDirectoryScoped();
      const source = path.join(base, 'source');
      const target = path.join(base, 'target');
      const outside = path.join(base, 'outside');
      yield* fs.makeDirectory(path.join(source, 'node_modules', 'dep'), { recursive: true });
      yield* fs.makeDirectory(target, { recursive: true });
      yield* fs.makeDirectory(outside);
      yield* fs.symlink(outside, path.join(target, 'node_modules'));
      const error = yield* Effect.flip(linkNodeModules(source, target));
      expect(error.message).toContain('symbolic link at node_modules');
      expect(yield* fs.readDirectory(outside)).toEqual([]);
    }),
  );
});
