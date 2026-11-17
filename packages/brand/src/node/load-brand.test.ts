import { NodeFileSystem } from '@effect/platform-node';
import { describe, expect, it, layer } from '@effect/vitest';
import { Effect, FileSystem, PlatformError } from 'effect';
import path from 'node:path';

import type { BrandInput } from '#schema/brand-schema.ts';

import { fromHex } from '#color/color.ts';
import { contrastRatio, worstContrast } from '#color/contrast.ts';
import { brandTokensJson } from '#node/brand-json.ts';
import { listBrands } from '#node/brand-paths.ts';
import { loadBrand } from '#node/load-brand.ts';
import { resolveBrand } from '#resolve/resolve-brand.ts';
import { TEXT_TONES, textBackgrounds } from '#resolve/text-colors.ts';
import { TEST_BRAND, testBrand } from '#test-brand.fixture.ts';

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, '../../../..');

/**
 * The shipped brands.
 */
const SHIPPED_BRANDS = ['default', 'nocturne'] as const;

/**
 * A shipped brand's `brand.ts` default export.
 */
const importShipped = Effect.fn('importShipped')(function* (
  name: string,
): Effect.fn.Return<BrandInput> {
  const file = path.join(WORKSPACE_ROOT, 'brands', name, 'brand.ts');
  const module = yield* Effect.promise(
    (): Promise<{ default: BrandInput }> => import(/* @vite-ignore */ file),
  );
  return module.default;
});

/**
 * A fresh workspace folder, removed when the test's scope closes.
 */
const makeWorkspace = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.makeTempDirectoryScoped({ prefix: 'deck-brands-' });
});

/**
 * Writes `brands/<name>/brand.ts` exporting the brand, plus its logo unless told otherwise.
 */
const writeBrand = Effect.fn('writeBrand')(function* (
  workspace: string,
  name: string,
  brand: unknown,
  withLogo = true,
) {
  const fs = yield* FileSystem.FileSystem;
  const dir = path.join(workspace, 'brands', name);
  yield* fs.makeDirectory(path.join(dir, 'logos'), { recursive: true });
  yield* fs.writeFileString(
    path.join(dir, 'brand.ts'),
    `export default ${JSON.stringify(brand)};\n`,
  );
  if (withLogo) {
    yield* fs.writeFileString(
      path.join(dir, 'logos', 'mark.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg"/>',
    );
  }
});

/**
 * The message a brand fails to load with, or `loaded` when it loads.
 */
function loadError(workspace: string, name: string) {
  return loadBrand(workspace, name).pipe(
    Effect.match({ onSuccess: () => 'loaded', onFailure: (error) => String(error) }),
  );
}

layer(NodeFileSystem.layer)('loadBrand with the workspace brands', (it) => {
  it.effect('loads both shipped brands with their Fontsource files and logos', () =>
    Effect.gen(function* () {
      expect(yield* listBrands(WORKSPACE_ROOT)).toEqual(
        expect.arrayContaining(['default', 'nocturne']),
      );
      for (const name of ['default', 'nocturne']) {
        const brand = yield* loadBrand(WORKSPACE_ROOT, name);
        expect(brand.warnings).toEqual([]);
        expect(brand.fontFaces.length).toBeGreaterThan(0);
        const files = [
          ...brand.fontFaces.map((face) => face.url),
          ...Object.values(brand.logoFiles),
        ];
        const fs = yield* FileSystem.FileSystem;
        yield* Effect.forEach(files, (file) => fs.access(file));
      }
    }),
  );

  it.effect('loads static Fontsource weights and variable weight ranges', () =>
    Effect.gen(function* () {
      const nocturne = yield* loadBrand(WORKSPACE_ROOT, 'nocturne');
      const plex = nocturne.fontFaces.filter((face) => face.family === 'IBM Plex Mono');
      expect([...new Set(plex.map((face) => face.weight))]).toEqual([400, 500]);
      const fraunces = nocturne.fontFaces.find((face) => face.family === 'Fraunces');
      expect(fraunces?.weight).toEqual([100, 900]);
      expect(fraunces?.url).toMatch(/fraunces-latin-full-normal\.woff2$/);
    }),
  );

  it.effect('prints the tokens as JSON for the CLI', () =>
    Effect.gen(function* () {
      const json = JSON.parse(yield* brandTokensJson(WORKSPACE_ROOT, 'default'));
      expect(json.name).toBe('default');
      expect(Object.keys(json.surfaces)).toEqual(['default', 'inverse', 'accent', 'gradient']);
      expect(json.surfaces.inverse.roles.bg).toBe('#0c0e13');
    }),
  );
});

layer(NodeFileSystem.layer)('the shipped brands', (it) => {
  it.effect('draw every chart color at 3:1 on every surface’s chart plate', () =>
    Effect.gen(function* () {
      for (const name of SHIPPED_BRANDS) {
        const { tokens, warnings } = yield* resolveBrand(yield* importShipped(name));
        expect(warnings).toEqual([]);
        for (const surface of Object.values(tokens.surfaces)) {
          const plate = fromHex(surface.data.plate);
          const ratios = surface.data.categorical.map((color) =>
            contrastRatio(fromHex(color), plate),
          );
          expect(Math.min(...ratios), `${name} ${surface.name}`).toBeGreaterThanOrEqual(3);
        }
      }
    }),
  );

  it.effect('set small text in the accent, positive and negative at 4.5:1 on every surface', () =>
    Effect.gen(function* () {
      for (const name of SHIPPED_BRANDS) {
        const { tokens } = yield* resolveBrand(yield* importShipped(name));
        for (const surface of Object.values(tokens.surfaces)) {
          const backgrounds = textBackgrounds(surface.backdrop, surface.data.plate);
          for (const tone of TEXT_TONES) {
            expect(
              worstContrast(fromHex(surface.text[tone]), backgrounds),
              `${name} ${surface.name} ${tone}`,
            ).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    }),
  );

  it.effect('take a per-surface diagram or code override in their own accent', () =>
    Effect.gen(function* () {
      for (const name of SHIPPED_BRANDS) {
        const brand = yield* importShipped(name);
        const accent = brand.color.roles.accent;
        const surfaces = {
          ...brand.color.surfaces,
          default: {
            ...brand.color.surfaces.default,
            diagram: { packet: accent },
            code: { keyword: accent },
          },
        };
        const result = yield* Effect.result(
          resolveBrand({ ...brand, color: { ...brand.color, surfaces } }),
        );
        expect(result._tag, name).toBe('Success');
      }
    }),
  );
});

layer(NodeFileSystem.layer)('listBrands', (it) => {
  it.effect('lists the folders under brands/ that hold a brand.ts, sorted', () =>
    Effect.gen(function* () {
      const workspace = yield* makeWorkspace;
      const fs = yield* FileSystem.FileSystem;
      yield* writeBrand(workspace, 'zebra', testBrand());
      yield* writeBrand(workspace, 'acme', testBrand());
      yield* fs.makeDirectory(path.join(workspace, 'brands', 'drafts'), { recursive: true });
      expect(yield* listBrands(workspace)).toEqual(['acme', 'zebra']);
    }),
  );

  it.effect('lists no brands for a workspace without brands/', () =>
    Effect.gen(function* () {
      expect(yield* listBrands(yield* makeWorkspace)).toEqual([]);
    }),
  );
});

layer(NodeFileSystem.layer)('loadBrand errors', (it) => {
  it.effect('names the brands that exist for one that does not', () =>
    Effect.gen(function* () {
      const workspace = yield* makeWorkspace;
      yield* writeBrand(workspace, 'test', testBrand());
      expect(yield* loadError(workspace, 'tset')).toBe(
        [
          'BrandError: No such brand in brands/tset/brand.ts:',
          '  - There is no brands/tset/brand.ts.',
          '    Fix: Use "test". Or create brands/tset/brand.ts.',
        ].join('\n'),
      );
    }),
  );

  it.effect('names the built-in default brand in a workspace that has no brands/ folder', () =>
    Effect.gen(function* () {
      const workspace = yield* makeWorkspace;
      expect(yield* loadError(workspace, 'acme')).toBe(
        [
          'BrandError: No such brand in brands/acme/brand.ts:',
          '  - There is no brands/acme/brand.ts.',
          '    Fix: Use one of: default. Or create brands/acme/brand.ts.',
        ].join('\n'),
      );
    }),
  );

  it.effect('refuses a brand name that is a path, without importing the brand.ts it names', () =>
    Effect.gen(function* () {
      const workspace = yield* makeWorkspace;
      const fs = yield* FileSystem.FileSystem;
      yield* writeBrand(workspace, 'test', testBrand());
      const marker = path.join(workspace, 'imported.txt');
      const evil = path.join(workspace, 'decks', 'x', 'evilbrand');
      yield* fs.makeDirectory(evil, { recursive: true });
      yield* fs.writeFileString(
        path.join(evil, 'brand.ts'),
        [
          "import { writeFileSync } from 'node:fs';",
          `writeFileSync(${JSON.stringify(marker)}, 'imported');`,
          'export default {};',
        ].join('\n'),
      );
      for (const name of [
        '../decks/x/evilbrand',
        evil,
        'brands/../../decks/x/evilbrand',
        '..',
        '.hidden',
        'Test',
        'a\0b',
        'a'.repeat(65),
      ]) {
        const message = yield* loadError(workspace, name);
        expect(message, name).toContain('BrandError: Invalid brand name in brands/:');
        expect(message, name).toContain('is not a brand folder name');
        expect(message, name).toContain('Fix: Name the folder, not a path, such as "default".');
      }

      const json = yield* Effect.flip(brandTokensJson(workspace, '../decks/x/evilbrand'));
      expect(json.summary).toBe('Invalid brand name');
      expect(yield* fs.exists(marker)).toBe(false);
    }),
  );

  it.effect('requires the brand name to match its folder and its files to exist', () =>
    Effect.gen(function* () {
      const workspace = yield* makeWorkspace;
      yield* writeBrand(
        workspace,
        'acme',
        testBrand({
          'typography.families.body.source': {
            kind: 'fontsource',
            package: '@fontsource-variable/not-installed',
          },
        }),
        false,
      );
      const message = yield* loadError(workspace, 'acme');
      expect(message).toContain('The brand cannot be loaded in brands/acme/brand.ts:');
      expect(message).toContain('  - name: The brand is named "test" but lives in brands/acme/.');
      expect(message).toContain(
        'Fix: Add "@fontsource-variable/not-installed" to the dependencies in ' +
          'brands/acme/package.json and run pnpm install.',
      );
      expect(message).toContain('  - logo.variants.primary.file: logos/mark.svg does not exist');
    }),
  );

  it.effect('warns, without failing, about a font that has no files', () =>
    Effect.gen(function* () {
      const workspace = yield* makeWorkspace;
      yield* writeBrand(
        workspace,
        'test',
        testBrand({
          'typography.families.display.source': { kind: 'unavailable', reason: 'licence pending' },
        }),
      );
      const brand = yield* loadBrand(workspace, 'test');
      expect(brand.warnings).toEqual([
        {
          path: 'typography.families.display.source',
          message:
            'Display has no font files (licence pending), so text renders in Display, sans-serif.',
          fix: 'Add the licensed files to the brand\'s fonts/ folder and use `kind: "files"`.',
        },
      ]);
    }),
  );

  it.effect('refuses font and logo files outside the brand folder, symlinks followed', () =>
    Effect.gen(function* () {
      const workspace = yield* makeWorkspace;
      const fs = yield* FileSystem.FileSystem;
      const outside = path.join(workspace, 'secret.woff2');
      yield* fs.writeFile(outside, WOFF2_BYTES);
      yield* fs.writeFileString(path.join(workspace, 'secret.svg'), '<svg/>');
      for (const file of ['../../package.json', '/etc/hosts', '../secret.woff2']) {
        yield* writeBrand(workspace, 'test', withFontFile(file));
        const message = yield* loadError(workspace, 'test');
        expect(message, file).toContain('typography.families.body.source.files[0].path');
      }

      yield* writeBrand(workspace, 'test', withFontFile('fonts/body.woff2'), false);
      const dir = path.join(workspace, 'brands', 'test');
      yield* fs.makeDirectory(path.join(dir, 'fonts'), { recursive: true });
      yield* fs.symlink(outside, path.join(dir, 'fonts', 'body.woff2'));
      yield* fs.remove(path.join(dir, 'logos', 'mark.svg'), { force: true });
      yield* fs.symlink(path.join(workspace, 'secret.svg'), path.join(dir, 'logos', 'mark.svg'));
      const message = yield* loadError(workspace, 'test');
      expect(message).toContain(
        'typography.families.body.source.files[0].path: fonts/body.woff2 is outside brands/test/',
      );
      expect(message).toContain(
        'logo.variants.primary.file: logos/mark.svg is outside brands/test/',
      );
    }),
  );

  it.effect('refuses font and logo files whose content is not what their extension says', () =>
    Effect.gen(function* () {
      const workspace = yield* makeWorkspace;
      const fs = yield* FileSystem.FileSystem;
      yield* writeBrand(workspace, 'test', withFontFile('fonts/body.woff2'), false);
      const dir = path.join(workspace, 'brands', 'test');
      yield* fs.makeDirectory(path.join(dir, 'fonts'), { recursive: true });
      yield* fs.writeFileString(path.join(dir, 'fonts', 'body.woff2'), '{"name":"not a font"}');
      yield* fs.writeFileString(path.join(dir, 'logos', 'mark.svg'), 'PK\u0003\u0004 not an svg');
      const message = yield* loadError(workspace, 'test');
      expect(message).toContain(
        'typography.families.body.source.files[0].path: fonts/body.woff2 is not a WOFF2 font file',
      );
      expect(message).toContain('logo.variants.primary.file: logos/mark.svg is not an SVG image');
    }),
  );

  it.effect('loads a font file that is what it says, inside the brand folder', () =>
    Effect.gen(function* () {
      const workspace = yield* makeWorkspace;
      const fs = yield* FileSystem.FileSystem;
      yield* writeBrand(workspace, 'test', withFontFile('fonts/body.woff2'));
      const dir = path.join(workspace, 'brands', 'test');
      yield* fs.makeDirectory(path.join(dir, 'fonts'), { recursive: true });
      yield* fs.writeFile(path.join(dir, 'fonts', 'body.woff2'), WOFF2_BYTES);
      const brand = yield* loadBrand(workspace, 'test');
      expect(brand.fontFaces.map((face) => face.url)).toEqual([
        path.join(dir, 'fonts', 'body.woff2'),
      ]);
    }),
  );

  it.effect('loads background layer files, warning about a wrong aspect and a small photo', () =>
    Effect.gen(function* () {
      const workspace = yield* makeWorkspace;
      const fs = yield* FileSystem.FileSystem;
      yield* writeBrand(workspace, 'test', withBackground());
      const dir = path.join(workspace, 'brands', 'test', 'backgrounds');
      yield* fs.makeDirectory(dir, { recursive: true });
      yield* fs.writeFile(path.join(dir, 'city.jpg'), jpegBytes(1280, 720));
      yield* fs.writeFileString(
        path.join(dir, 'mark.svg'),
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"/>',
      );
      const brand = yield* loadBrand(workspace, 'test');
      expect(brand.backgroundFiles).toEqual({
        'backgrounds/city.jpg': path.join(dir, 'city.jpg'),
        'backgrounds/mark.svg': path.join(dir, 'mark.svg'),
      });
      expect(brand.warnings).toEqual([
        expect.objectContaining({
          path: 'color.surfaces.photo.background[0].file',
          message: expect.stringContaining('city.jpg is 1280x720 pixels'),
        }),
        expect.objectContaining({
          path: 'color.surfaces.photo.background[1].aspect',
          fix: 'Set `aspect: 2`.',
        }),
      ]);
    }),
  );

  it.effect('refuses background files that are missing or not what their extension says', () =>
    Effect.gen(function* () {
      const workspace = yield* makeWorkspace;
      const fs = yield* FileSystem.FileSystem;
      yield* writeBrand(workspace, 'test', withBackground());
      const dir = path.join(workspace, 'brands', 'test', 'backgrounds');
      yield* fs.makeDirectory(dir, { recursive: true });
      yield* fs.writeFileString(path.join(dir, 'city.jpg'), '<svg/>');
      const message = yield* loadError(workspace, 'test');
      expect(message).toContain(
        'color.surfaces.photo.background[0].file: backgrounds/city.jpg is not a JPEG image',
      );
      expect(message).toContain(
        'color.surfaces.photo.background[1].file: backgrounds/mark.svg does not exist',
      );
    }),
  );
});

/**
 * The test brand with a `photo` surface: a photo and a placed mark whose `aspect` is 1.
 */
function withBackground(): unknown {
  return testBrand({
    'color.surfaces.photo': {
      bg: 'gray.0',
      background: [
        { type: 'image', file: 'backgrounds/city.jpg' },
        { type: 'placed', file: 'backgrounds/mark.svg', aspect: 1, anchor: 'top-right', width: 96 },
      ],
    },
  });
}

/**
 * The start of a JPEG of the given size: the start-of-image marker and a frame header.
 *
 * @param width - Pixels.
 * @param height - Pixels.
 */
function jpegBytes(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0,
    17,
    8,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    3,
    ...Array.from({ length: 16 }, () => 0),
  ]);
}

/**
 * The first bytes of a WOFF2 file, enough for its signature.
 */
const WOFF2_BYTES = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 1, 0, 0, 0, 0, 0, 0]);

/**
 * The test brand with its body family loaded from one file at a path.
 *
 * @param file - The font file's path as the brand writes it.
 */
function withFontFile(file: string): unknown {
  return testBrand({
    'typography.families.body.source': { kind: 'files', files: [{ path: file, weight: 400 }] },
    'typography.scale': Object.fromEntries(
      Object.entries(TEST_BRAND.typography.scale).map(([step, spec]) => [
        step,
        spec.family === 'body' ? { ...spec, weight: 400 } : spec,
      ]),
    ),
  });
}

describe('loadBrand when the brand file changes while it loads', () => {
  it.effect('reports a brand file that disappears before it is stat-ed, as a BrandError', () =>
    Effect.gen(function* () {
      const text = `export default ${JSON.stringify(testBrand())};\n`;
      const error = yield* Effect.flip(loadBrand('/workspace', 'test')).pipe(
        Effect.provide(
          FileSystem.layerNoop({
            exists: () => Effect.succeed(true),
            readFileString: () => Effect.succeed(text),
            stat: (file) =>
              Effect.fail(
                PlatformError.systemError({
                  _tag: 'NotFound',
                  module: 'FileSystem',
                  method: 'stat',
                  pathOrDescriptor: file,
                }),
              ),
          }),
        ),
      );
      expect(error._tag).toBe('BrandError');
      expect(error.message).toContain('It changed or disappeared while it was being read');
    }),
  );
});
