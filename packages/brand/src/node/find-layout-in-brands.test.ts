import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { findLayoutInBrands, resetLayoutCache } from '#node/find-layout-in-brands.ts';

/**
 * A layouts file with one layout, written as `defineBrandLayouts([...])` around a literal.
 */
function layoutsSource(name: string, fallback: string): string {
  return [
    "import { defineBrandLayouts } from '@deckster/brand';",
    '',
    'export default defineBrandLayouts([',
    `  { name: '${name}', description: 'A layout.', fallback: '${fallback}', title: false, regions: [{ bind: { slot: 'body' }, box: [0, 0, 400, 400] }] },`,
    ']);',
    '',
  ].join('\n');
}

/**
 * Makes a workspace with `brands/<name>/layouts.ts` for each entry, and removes it afterwards.
 */
async function withWorkspace(
  files: Readonly<Record<string, string>>,
  run: (root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'deck-layouts-'));
  try {
    for (const [brand, text] of Object.entries(files)) {
      await mkdir(path.join(root, 'brands', brand), { recursive: true });
      await writeFile(path.join(root, 'brands', brand, 'layouts.ts'), text);
    }

    resetLayoutCache();
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe('findLayoutInBrands', () => {
  it('finds the brands that define the layout, except the named one', async () => {
    await withWorkspace(
      {
        acme: layoutsSource('big-photo', 'image'),
        nocturne: layoutsSource('big-photo', 'image'),
        other: layoutsSource('another', 'title'),
      },
      async (root) => {
        const found = await Effect.runPromise(findLayoutInBrands(root, 'big-photo', 'acme'));
        expect(found).toEqual([{ brand: 'nocturne', fallback: 'image' }]);
        const all = await Effect.runPromise(findLayoutInBrands(root, 'big-photo', 'default'));
        expect(all.map((match) => match.brand)).toEqual(['acme', 'nocturne']);
      },
    );
  });

  it('reports each brand with its own fallback', async () => {
    await withWorkspace(
      { acme: layoutsSource('hero', 'title'), nocturne: layoutsSource('hero', 'image') },
      async (root) => {
        const found = await Effect.runPromise(findLayoutInBrands(root, 'hero', 'default'));
        expect(found).toEqual([
          { brand: 'acme', fallback: 'title' },
          { brand: 'nocturne', fallback: 'image' },
        ]);
      },
    );
  });

  it('skips a file that does not decode, one that needs to run and a brand without one', async () => {
    await withWorkspace(
      {
        broken: "export default [{ name: 'hero' }];\n",
        dynamic: `const name = 'hero';\nexport default [{ name, fallback: 'title' }];\n`,
        garbage: 'export default [',
      },
      async (root) => {
        await mkdir(path.join(root, 'brands', 'empty'), { recursive: true });
        expect(await Effect.runPromise(findLayoutInBrands(root, 'hero', 'default'))).toEqual([]);
      },
    );
  });

  it('finds nothing in a workspace without brands', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'deck-layouts-'));
    try {
      expect(await Effect.runPromise(findLayoutInBrands(root, 'hero', 'default'))).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reads a file again after it changes', async () => {
    await withWorkspace({ acme: layoutsSource('hero', 'title') }, async (root) => {
      const file = path.join(root, 'brands', 'acme', 'layouts.ts');
      const first = await Effect.runPromise(findLayoutInBrands(root, 'hero', 'default'));
      expect(first).toEqual([{ brand: 'acme', fallback: 'title' }]);
      await writeFile(file, layoutsSource('hero', 'image'));
      const later = new Date(Date.now() + 5000);
      await utimes(file, later, later);
      const second = await Effect.runPromise(findLayoutInBrands(root, 'hero', 'default'));
      expect(second).toEqual([{ brand: 'acme', fallback: 'image' }]);
    });
  });

  it('serves an unchanged file from the cache', async () => {
    await withWorkspace({ acme: layoutsSource('hero', 'title') }, async (root) => {
      const file = path.join(root, 'brands', 'acme', 'layouts.ts');
      const fixed = new Date('2026-01-01T00:00:00Z');
      await utimes(file, fixed, fixed);
      await Effect.runPromise(findLayoutInBrands(root, 'hero', 'default'));
      await writeFile(file, layoutsSource('hero', 'image'));
      await utimes(file, fixed, fixed);
      const found = await Effect.runPromise(findLayoutInBrands(root, 'hero', 'default'));
      expect(found).toEqual([{ brand: 'acme', fallback: 'title' }]);
    });
  });
});
