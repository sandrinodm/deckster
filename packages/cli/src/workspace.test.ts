import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { ConfigProvider, Effect, FileSystem } from 'effect';
import path from 'node:path';

import { assertSafeRoot, discoverWorkspace } from '#workspace.ts';

describe('discoverWorkspace', () => {
  it.effect('resolves DECK_ROOT through symbolic links to match Vite module paths', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: 'workspace-' });
      const workspace = path.join(root, 'workspace');
      const alias = path.join(root, 'alias');
      yield* fs.makeDirectory(workspace);
      yield* fs.symlink(workspace, alias);

      const discovered = yield* discoverWorkspace(root, '/nowhere').pipe(
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env: { DECK_ROOT: alias } }))),
      );
      expect(discovered).toBe(yield* fs.realPath(workspace));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect('resolves a relative DECK_ROOT against the current folder', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: 'workspace-' });
      const workspace = path.join(root, 'workspace');
      yield* fs.makeDirectory(workspace);

      const discovered = yield* discoverWorkspace(root, '/nowhere').pipe(
        Effect.provide(
          ConfigProvider.layer(ConfigProvider.fromEnv({ env: { DECK_ROOT: './workspace' } })),
        ),
      );
      expect(discovered).toBe(yield* fs.realPath(workspace));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect('keeps a new DECK_ROOT available for workspace creation', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: 'workspace-' });
      const discovered = yield* discoverWorkspace(root, '/nowhere').pipe(
        Effect.provide(
          ConfigProvider.layer(ConfigProvider.fromEnv({ env: { DECK_ROOT: 'new/workspace' } })),
        ),
      );
      expect(discovered).toBe(path.join(root, 'new', 'workspace'));
      expect(yield* fs.exists(discovered)).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect('leaves real path failures for the command to report', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: 'workspace-' });
      const error = yield* Effect.flip(fs.realPath(path.join(root, 'missing')));
      const failing = { ...fs, realPath: () => Effect.fail(error) };
      const discovered = yield* discoverWorkspace(root, '/nowhere').pipe(
        Effect.provideService(FileSystem.FileSystem, failing),
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env: { DECK_ROOT: root } }))),
      );
      expect(discovered).toBe(root);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect('accepts an explicit DECK_ROOT that names the home or root folder', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const home = yield* fs.makeTempDirectoryScoped({ prefix: 'home-' });
      for (const root of [home, path.parse(home).root]) {
        const discovered = yield* discoverWorkspace(home, home).pipe(
          Effect.provide(
            ConfigProvider.layer(ConfigProvider.fromEnv({ env: { DECK_ROOT: root } })),
          ),
        );
        expect(discovered).toBe(yield* fs.realPath(root));
      }
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect('treats an empty DECK_ROOT as unset for an implicit linked workspace', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: 'workspace-' });
      const workspace = path.join(root, 'workspace');
      const alias = path.join(root, 'alias');
      yield* fs.makeDirectory(path.join(workspace, 'decks'), { recursive: true });
      yield* fs.symlink(workspace, alias);

      const discovered = yield* discoverWorkspace(path.join(alias, 'decks'), '/nowhere').pipe(
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env: { DECK_ROOT: '' } }))),
      );
      expect(discovered).toBe(yield* fs.realPath(workspace));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect('refuses an implicit home folder when its root or home path is a symbolic link', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: 'workspace-' });
      const home = path.join(root, 'home');
      const alias = path.join(root, 'alias');
      yield* fs.makeDirectory(path.join(home, 'decks'), { recursive: true });
      yield* fs.symlink(home, alias);

      for (const [cwd, homePath] of [
        [alias, home],
        [home, alias],
      ] as const) {
        const error = yield* Effect.flip(discoverWorkspace(cwd, homePath)).pipe(
          Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} }))),
        );
        expect(error.message).toContain('home or root folder');
      }
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect('uses the nearest folder at or above the current one that has decks/', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: 'workspace-' });
      const nested = path.join(root, 'talks', 'decks', 'a', 'slides');
      yield* fs.makeDirectory(nested, { recursive: true });

      const discovered = yield* discoverWorkspace(nested, '/nowhere').pipe(
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} }))),
      );
      expect(discovered).toBe(yield* fs.realPath(path.join(root, 'talks')));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect('refuses a home folder that has decks/, found from a folder below it', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const home = yield* fs.makeTempDirectoryScoped({ prefix: 'home-' });
      yield* fs.makeDirectory(path.join(home, 'decks'));
      yield* fs.makeDirectory(path.join(home, 'projects'));

      const error = yield* Effect.flip(discoverWorkspace(path.join(home, 'projects'), home)).pipe(
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} }))),
      );
      expect(error.message).toContain('home or root folder');
      expect(error.message).toContain('mkdir talks');
      expect(error.message).toContain('DECK_ROOT');
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect('refuses the filesystem root and the home folder, and accepts a project folder', () =>
    Effect.gen(function* () {
      const root = yield* Effect.flip(assertSafeRoot('/', '/home/me'));
      const home = yield* Effect.flip(assertSafeRoot('/home/me', '/home/me'));

      expect(root.message).toContain('home or root folder');
      expect(home.message).toContain('home or root folder');
      expect(yield* assertSafeRoot('/home/me/talks', '/home/me')).toBe('/home/me/talks');
    }),
  );
});
