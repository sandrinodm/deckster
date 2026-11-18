import { NodeFileSystem } from '@effect/platform-node';
import { expect, layer } from '@effect/vitest';
import { Effect, FileSystem } from 'effect';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { holdCode } from '#node/code-gate.ts';
import { loadBrand } from '#node/load-brand.ts';
import { FIXTURE_ART_FILE, TEST_LAYOUTS, testBrand } from '#test-brand.fixture.ts';

/**
 * The SVG every art file in these tests holds.
 */
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>';

/**
 * A fresh workspace folder, removed when the test's scope closes.
 */
const makeWorkspace = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.makeTempDirectoryScoped({ prefix: 'deck-layouts-' });
});

/**
 * Writes `brands/test/` with its brand, its logo, optionally its layouts and its art file.
 */
const writeBrand = Effect.fn('writeBrand')(function* (
  workspace: string,
  options: { layouts?: string; art?: boolean },
) {
  const fs = yield* FileSystem.FileSystem;
  const dir = path.join(workspace, 'brands', 'test');
  yield* fs.makeDirectory(path.join(dir, 'logos'), { recursive: true });
  yield* fs.makeDirectory(path.join(dir, 'backgrounds'), { recursive: true });
  const brand = testBrand({
    'logo.variants': { mark: { file: 'logos/mark.svg', aspect: 1 } },
    'logo.default': 'mark',
  });
  yield* fs.writeFileString(
    path.join(dir, 'brand.ts'),
    `export default ${JSON.stringify(brand)};\n`,
  );
  yield* fs.writeFileString(path.join(dir, 'logos', 'mark.svg'), SVG);
  if (options.art === true) {
    yield* fs.writeFileString(path.join(dir, FIXTURE_ART_FILE), SVG);
  }

  if (options.layouts !== undefined) {
    yield* fs.writeFileString(path.join(dir, 'layouts.ts'), options.layouts);
  }

  return dir;
});

/**
 * The text of a `layouts.ts` that exports the fixture layouts.
 */
const FIXTURE_FILE = `import { defineBrandLayouts } from '@deckster/brand';\n\nexport default defineBrandLayouts(${JSON.stringify(TEST_LAYOUTS)});\n`;

layer(NodeFileSystem.layer)('loadBrand with layouts.ts', (it) => {
  it.effect('loads a brand without layouts.ts with no layouts', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const workspace = yield* makeWorkspace;
        yield* writeBrand(workspace, {});
        const loaded = yield* loadBrand(workspace, 'test');
        expect(loaded.tokens.layouts).toEqual([]);
        expect(loaded.layoutsFile).toBeUndefined();
      }),
    ),
  );

  it.effect('loads layouts and their art files', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const workspace = yield* makeWorkspace;
        const dir = yield* writeBrand(workspace, { layouts: FIXTURE_FILE, art: true });
        const loaded = yield* loadBrand(workspace, 'test', { read: 'data' });
        expect(loaded.tokens.layouts.map((layout) => layout.name)).toEqual([
          'fixture-cover',
          'fixture-photo',
          'fixture-two-up',
        ]);
        expect(loaded.layoutsFile).toBe(path.join(dir, 'layouts.ts'));
        expect(loaded.backgroundFiles).toEqual({
          [FIXTURE_ART_FILE]: path.join(dir, FIXTURE_ART_FILE),
        });
      }),
    ),
  );

  it.effect('imports layouts.ts as code outside a data read', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const workspace = yield* makeWorkspace;
        yield* writeBrand(workspace, {
          layouts: `export default ${JSON.stringify(TEST_LAYOUTS)};\n`,
          art: true,
        });
        const loaded = yield* loadBrand(workspace, 'test');
        expect(loaded.tokens.layouts).toHaveLength(3);
      }),
    ),
  );

  it.effect('fails a data read of a layouts.ts that is more than data', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const workspace = yield* makeWorkspace;
        yield* writeBrand(workspace, {
          layouts: `const x = 1;\nexport default [{ name: String(x) }];\n`,
        });
        const message = yield* loadBrand(workspace, 'test', { read: 'data' }).pipe(
          Effect.flip,
          Effect.map((error) => error.message),
        );
        expect(message).toContain('Could not read the layouts in brands/test/layouts.ts');
        expect(message).toContain('defineBrandLayouts');
      }),
    ),
  );

  it.effect('fails a layouts.ts that exports something other than a list', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const workspace = yield* makeWorkspace;
        yield* writeBrand(workspace, { layouts: 'export default { name: "x" };\n' });
        const message = yield* loadBrand(workspace, 'test').pipe(
          Effect.flip,
          Effect.map((error) => error.message),
        );
        expect(message).toContain('brands/test/layouts.ts');
        expect(message).toContain('no default export with the layouts');
      }),
    ),
  );

  it.effect('names layouts.ts and the layout path when a layout is invalid', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const workspace = yield* makeWorkspace;
        const broken = [
          { ...TEST_LAYOUTS[2], regions: [{ bind: { slot: 'body' }, box: [0, 0, 5000, 100] }] },
        ];
        yield* writeBrand(workspace, { layouts: `export default ${JSON.stringify(broken)};\n` });
        const error = yield* loadBrand(workspace, 'test').pipe(Effect.flip);
        expect(error.source).toBe('brands/test/layouts.ts');
        expect(error.file).toBe(path.join(workspace, 'brands', 'test', 'layouts.ts'));
        expect(error.problems[0]?.path).toBe('layouts[0].regions[0].box');
      }),
    ),
  );

  it.effect('fails a layout art file that is missing, naming layouts.ts', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const workspace = yield* makeWorkspace;
        yield* writeBrand(workspace, { layouts: FIXTURE_FILE, art: false });
        const error = yield* loadBrand(workspace, 'test').pipe(Effect.flip);
        expect(error.source).toBe('brands/test/layouts.ts');
        expect(error.problems.map((problem) => problem.path)).toEqual([
          'layouts[0].background.default[0].file',
          'layouts[0].background.inverse[0].file',
        ]);
      }),
    ),
  );

  it.effect('loads a vouched layouts.ts during an agent turn, cold', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const workspace = yield* makeWorkspace;
        const dir = yield* writeBrand(workspace, { layouts: FIXTURE_FILE, art: true });
        const hold = holdCode([dir]);
        for (const name of ['brand.ts', 'layouts.ts']) {
          hold.accept(path.join(dir, name), readFileSync(path.join(dir, name), 'utf8'));
        }

        const loaded = yield* loadBrand(workspace, 'test').pipe(
          Effect.ensuring(Effect.sync(hold.release)),
        );
        expect(loaded.tokens.layouts).toHaveLength(3);
      }),
    ),
  );

  it.effect('keeps vouched layouts.ts edits and the loaded value during a turn, warm', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const workspace = yield* makeWorkspace;
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* writeBrand(workspace, { layouts: FIXTURE_FILE, art: true });
        yield* loadBrand(workspace, 'test');
        const hold = holdCode([dir]);
        hold.accept(path.join(dir, 'brand.ts'), readFileSync(path.join(dir, 'brand.ts'), 'utf8'));
        const edited = `export default ${JSON.stringify(TEST_LAYOUTS.slice(0, 1))};\n`;
        yield* fs.writeFileString(path.join(dir, 'layouts.ts'), edited);
        const unvouched = yield* loadBrand(workspace, 'test');
        hold.accept(path.join(dir, 'layouts.ts'), edited);
        const vouched = yield* loadBrand(workspace, 'test');
        hold.release();
        expect(unvouched.tokens.layouts).toHaveLength(3);
        expect(vouched.tokens.layouts).toHaveLength(1);
      }),
    ),
  );

  it.effect('does not return a deleted layouts.ts again when it is created during a turn', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const workspace = yield* makeWorkspace;
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* writeBrand(workspace, { layouts: FIXTURE_FILE, art: true });
        yield* loadBrand(workspace, 'test');
        const hold = holdCode([dir]);
        hold.accept(path.join(dir, 'brand.ts'), readFileSync(path.join(dir, 'brand.ts'), 'utf8'));
        yield* fs.remove(path.join(dir, 'layouts.ts'));
        const deleted = yield* loadBrand(workspace, 'test');
        yield* fs.writeFileString(
          path.join(dir, 'layouts.ts'),
          FIXTURE_FILE + '// made by the turn\n',
        );
        const created = yield* loadBrand(workspace, 'test');
        hold.release();
        expect(deleted.tokens.layouts).toEqual([]);
        expect(created.tokens.layouts).toEqual([]);
      }),
    ),
  );
});
