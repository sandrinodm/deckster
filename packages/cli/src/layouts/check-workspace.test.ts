import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import { writeCheckWorkspace } from '#layouts/check-workspace.ts';

describe('writeCheckWorkspace', () => {
  it.effect(
    'links the installed packages entry by entry, so the server cache stays in the copy',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const root = yield* fs.makeTempDirectoryScoped({ prefix: 'check-workspace-root-' });
          const modules = path.join(root, 'node_modules');
          yield* fs.makeDirectory(path.join(modules, 'effect'), { recursive: true });
          yield* fs.makeDirectory(path.join(modules, '@scope', 'pkg'), { recursive: true });
          yield* fs.makeDirectory(path.join(modules, '.vite', 'deps'), { recursive: true });
          yield* fs.writeFileString(path.join(modules, 'effect', 'index.js'), 'export {};\n');

          const temp = yield* writeCheckWorkspace({
            root,
            brandDir: undefined,
            deck: undefined,
            deckId: 'layouts-check',
            slides: [],
            brand: 'default',
          });
          const linked = path.join(temp, 'node_modules');
          expect((yield* fs.stat(linked)).type).toBe('Directory');
          expect(yield* fs.readLink(path.join(linked, 'effect'))).toBe(
            path.join(modules, 'effect'),
          );
          expect(yield* fs.exists(path.join(linked, '@scope', 'pkg'))).toBe(true);
          expect(yield* fs.exists(path.join(linked, '.vite'))).toBe(false);

          // What the deck server does: it makes its cache folder under the workspace's node_modules.
          yield* fs.makeDirectory(path.join(linked, '.vite', 'deps'), { recursive: true });
          yield* fs.writeFileString(path.join(linked, '.vite', 'deps', 'cache.json'), '{}\n');
          expect(yield* fs.exists(path.join(modules, '.vite', 'deps', 'cache.json'))).toBe(false);
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
  );
});
