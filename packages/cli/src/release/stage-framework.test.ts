import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import { isShipped, stageFramework } from '#release/stage-framework.ts';

/**
 * Writes a file with its folders into a scratch repository.
 *
 * @param root - The scratch folder.
 * @param file - The path relative to it.
 * @param content - The file content.
 */
const write = Effect.fn('write')(function* (root: string, file: string, content: string) {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory(path.dirname(path.join(root, file)), { recursive: true });
  yield* fs.writeFileString(path.join(root, file), content);
});

describe('isShipped', () => {
  it('leaves out tests, fixtures, snapshots and test helpers', () => {
    expect(isShipped('a/b.test.ts')).toBe(false);
    expect(isShipped('a/b.fixture.tsx')).toBe(false);
    expect(isShipped('a/b.fixtures.ts')).toBe(false);
    expect(isShipped('a/b.fixture.css')).toBe(false);
    expect(isShipped('__snapshots__/b.snap')).toBe(false);
    expect(isShipped('release/stage-framework.ts')).toBe(false);
    expect(isShipped('testing/deck.tsx')).toBe(false);
  });

  it('ships sources and their assets', () => {
    expect(isShipped('a/b.ts')).toBe(true);
    expect(isShipped('a/b.tsx')).toBe(true);
    expect(isShipped('styles/tokens.css')).toBe(true);
    expect(isShipped('main/preload.cjs')).toBe(true);
  });
});

describe('stageFramework', () => {
  it.effect('lays out the packages and the default brand like the repository', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: 'stage-' });
      const manifest = JSON.stringify({
        name: '@deckster/engine',
        version: '0.0.0',
        private: true,
        type: 'module',
        imports: { '#*': './src/*' },
        exports: { '.': './src/index.ts' },
        scripts: { test: 'vp test' },
        dependencies: { react: 'catalog:' },
      });
      yield* write(root, 'packages/engine/package.json', manifest);
      yield* write(root, 'packages/engine/src/index.ts', 'export {};\n');
      yield* write(root, 'packages/engine/src/index.test.ts', 'test\n');
      yield* write(root, 'packages/engine/src/deck/deck.fixture.tsx', 'fixture\n');
      yield* write(root, 'packages/engine/e2e/engine.e2e.ts', 'e2e\n');
      yield* write(root, 'packages/shell/package.json', '{"name":"@deckster/shell","exports":{}}');
      yield* write(root, 'packages/shell/assets/icon.png', 'png');
      yield* write(root, 'brands/default/brand.ts', 'brand\n');
      yield* write(root, 'brands/default/logos/mark.svg', '<svg/>');
      yield* write(root, 'brands/default/package.json', '{"name":"@deckster/brand-default"}');
      yield* write(
        root,
        'packages/cli/package.json',
        JSON.stringify({
          name: '@deckster/cli',
          version: '1.2.3',
          dependencies: { zeta: 'catalog:', alpha: 'catalog:' },
        }),
      );
      const cliDir = path.join(root, 'packages/cli');

      const staged = yield* stageFramework({ repoRoot: root, cliDir });
      const framework = path.join(cliDir, 'dist/framework');
      const read = (file: string) => fs.readFileString(path.join(framework, file));

      expect(staged).toEqual(['cli', 'engine', 'shell']);
      expect(yield* fs.exists(path.join(framework, 'packages/engine/src/index.ts'))).toBe(true);
      expect(yield* fs.exists(path.join(framework, 'packages/engine/src/index.test.ts'))).toBe(
        false,
      );
      expect(
        yield* fs.exists(path.join(framework, 'packages/engine/src/deck/deck.fixture.tsx')),
      ).toBe(false);
      expect(yield* fs.exists(path.join(framework, 'packages/engine/e2e'))).toBe(false);
      expect(yield* fs.exists(path.join(framework, 'packages/shell/assets/icon.png'))).toBe(true);
      expect(yield* fs.exists(path.join(framework, 'brands/default/logos/mark.svg'))).toBe(true);
      expect(JSON.parse(yield* read('packages/engine/package.json'))).toEqual({
        name: '@deckster/engine',
        type: 'module',
        imports: { '#*': './src/*' },
        exports: { '.': './src/index.ts' },
      });
      expect(JSON.parse(yield* read('framework.json'))).toEqual({
        version: '1.2.3',
        dependencies: ['alpha', 'zeta'],
      });
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect('replaces what an earlier staging left', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: 'stage-' });
      yield* write(root, 'packages/cli/package.json', '{"name":"@deckster/cli","version":"1.0.0"}');
      yield* write(root, 'brands/default/brand.ts', 'brand\n');
      yield* write(root, 'brands/default/package.json', '{"name":"b"}');
      const cliDir = path.join(root, 'packages/cli');
      yield* write(cliDir, 'dist/framework/packages/old/src/gone.ts', 'old\n');

      yield* stageFramework({ repoRoot: root, cliDir });

      expect(yield* fs.exists(path.join(cliDir, 'dist/framework/packages/old'))).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
