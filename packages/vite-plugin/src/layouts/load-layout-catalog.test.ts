import { NodeFileSystem } from '@effect/platform-node';
import { describe, expect, it, layer } from '@effect/vitest';
import { Effect, FileSystem, Schema } from 'effect';
import path from 'node:path';

import { checkContract } from '#layouts/check-contract.ts';
import { loadLayoutCatalog } from '#layouts/load-layout-catalog.ts';
import { splitContract } from '#layouts/test-catalog.fixture.ts';

layer(NodeFileSystem.layer)('loadLayoutCatalog', (it) => {
  it.effect('loads the engine catalog, then the kit catalog over it', () =>
    Effect.gen(function* () {
      const catalog = yield* loadLayoutCatalog();
      expect(catalog.get('default')?.source).toBe('@deckster/kit');
      expect(Object.keys(catalog.get('default')?.contract.slots ?? {})).toEqual(['body']);
    }),
  );

  it.effect('names a catalog module whose default export is not a catalog', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'deck-catalog-' });
      const file = path.join(dir, 'catalog.mjs');
      yield* fs.writeFileString(file, 'export default 42;\n');
      const error = yield* Effect.flip(loadLayoutCatalog([file]));
      expect(error.message).toContain(`Invalid layout catalog in ${file}:`);
      expect(error.message).toContain('Fix: Export `defineLayoutCatalog({ source, layouts');
    }),
  );
});

describe('checkContract', () => {
  it('accepts a valid contract', () => {
    expect(checkContract(splitContract)).toEqual([]);
  });

  it('reports every problem with a contract, each with a fix', () => {
    const problems = checkContract({
      ...splitContract,
      name: 'Two Columns',
      surface: 'Accent',
      schema: Schema.Struct({ title: Schema.String }),
      slots: {
        Left: { description: 'x', accepts: ['bullets'] },
        notes: { description: 'y', accepts: [] },
      },
      budget: { right: { maxWords: 10 }, Left: { maxLines: 0 } },
      example: { frontmatter: { colour: 'red' }, body: '' },
    });
    expect(problems.map((problem) => problem.message)).toEqual([
      'Layout "Two Columns": the name is not kebab-case.',
      'Layout "Two Columns": the default surface is not a kebab-case surface name.',
      'Layout "Two Columns" redefines the "title" field, which every slide has.',
      'Layout "Two Columns": the slot name "Left" is not camelCase.',
      'Layout "Two Columns": the slot "notes" would be written <Notes>, a built-in component.',
      'Layout "Two Columns": the slot "notes" accepts nothing.',
      'Layout "Two Columns" budgets "right", which is not one of its slots.',
      'Layout "Two Columns": the "Left" budget\'s "maxLines" is not a limit the build knows, or not a positive integer.',
      'Layout "Two Columns": the "Left" budget sets maxLines, but the slot holds prose, whose lines depend on the brand\'s type size.',
      'Layout "Two Columns": the example has no body.',
      'Layout "Two Columns": example frontmatter: "colour" is not a frontmatter field.',
      'Layout "Two Columns": example frontmatter: layout: Expected a layout name in kebab-case, such as "request-flow", got "Two Columns".',
      'Layout "Two Columns": example frontmatter: title is required.',
    ]);
  });
});
