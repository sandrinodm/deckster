import { NodeFileSystem } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import type { LayoutCatalogIndex } from '#layouts/load-layout-catalog.ts';

import { loadLayoutCatalog } from '#layouts/load-layout-catalog.ts';
import { transformMdxSlide } from '#slides/transform-slide.ts';

const SLIDE_META_PATTERN = /export const slideMeta = (.*);\n$/;
const BRAND = { name: 'demo', surfaces: ['default', 'inverse', 'accent', 'gradient'] };
const KIT_EXEMPLARS = ['title', 'section', 'statement', 'content', 'split', 'stats'];

/**
 * Loads the engine and kit catalogs, as a deck build does.
 */
const kitCatalog = (): Effect.Effect<LayoutCatalogIndex, unknown> =>
  loadLayoutCatalog().pipe(Effect.provide(NodeFileSystem.layer));

/**
 * Compiles an MDX slide against the kit catalog and returns its `slideMeta`.
 */
const compile = Effect.fn('compile')(function* (source: string) {
  const layouts = yield* kitCatalog();
  const displayPath = 'decks/demo/slides/s.mdx';
  const code = yield* transformMdxSlide(
    {
      id: 's',
      code: source,
      displayPath,
      file: `/workspace/${displayPath}`,
      layouts,
      brand: BRAND,
    },
    false,
  );
  const json = SLIDE_META_PATTERN.exec(code)?.[1] ?? 'null';
  return JSON.parse(json) as { frontmatter: Record<string, unknown>; slots: string[] };
});

/**
 * The message a slide fails to compile with.
 */
const failure = (source: string) =>
  compile(source).pipe(
    Effect.flip,
    Effect.map((error) => String((error as Error).message)),
  );

/**
 * An MDX slide from frontmatter lines and a body.
 */
function mdx(frontmatter: readonly string[], body: string): string {
  return ['---', ...frontmatter, '---', '', body].join('\n');
}

describe('the kit layouts in the build', () => {
  it.effect("compile every exemplar layout's example, filling the slots it names", () =>
    Effect.gen(function* () {
      const layouts = yield* kitCatalog();
      for (const name of KIT_EXEMPLARS) {
        const contract = layouts.get(name)?.contract;
        expect(contract, name).toBeDefined();
        if (contract === undefined) {
          continue;
        }

        const lines = Object.entries({ layout: name, ...contract.example.frontmatter }).map(
          ([key, value]) => `${key}: ${JSON.stringify(value)}`,
        );
        const meta = yield* compile(mdx(lines, contract.example.body));
        expect(meta.frontmatter['layout'], name).toBe(name);
      }
    }),
  );

  it.effect('give covers, dividers and statements their surface unless the slide names one', () =>
    Effect.gen(function* () {
      const section = yield* compile(mdx(['layout: section', 'title: The plan'], 'Ten years.'));
      expect(section.frontmatter).toMatchObject({ surface: 'accent', chrome: false });
      const own = yield* compile(
        mdx(['layout: section', 'title: The plan', 'surface: inverse'], 'Ten years.'),
      );
      expect(own.frontmatter['surface']).toBe('inverse');
      const content = yield* compile(mdx(['layout: content', 'title: Why'], '- One point'));
      expect(content.frontmatter['surface']).toBeUndefined();
    }),
  );

  it.effect('fail a split without media, naming the slot and how to fill it', () =>
    Effect.gen(function* () {
      const message = yield* failure(mdx(['layout: split', 'title: A tree'], 'Shade.'));
      expect(message).toContain('The split layout needs its media slot.');
      expect(message).toContain('Add <Media>…</Media> at the top level of the slide');
    }),
  );

  it.effect('fail a statement with no statement outside its slot tags', () =>
    Effect.gen(function* () {
      const message = yield* failure(
        mdx(['layout: statement'], '<Attribution>Mariam Haddad</Attribution>'),
      );
      expect(message).toContain('The statement layout needs content outside its slot tags.');
    }),
  );

  it.effect('fail a slot tag the layout does not have, naming the layouts that do', () =>
    Effect.gen(function* () {
      const message = yield* failure(
        mdx(
          ['layout: content', 'title: Why'],
          '- One\n\n<Media>\n  <img src="a.jpg" alt="" />\n</Media>',
        ),
      );
      expect(message).toContain('<Media> on line');
      expect(message).toContain('is not a slot of the content layout');
      expect(message).toContain('title, section, split');
    }),
  );

  it.effect('fail a stats slide with one stat, with the fix for the field', () =>
    Effect.gen(function* () {
      const message = yield* failure(
        mdx(['layout: stats', 'title: Shade', 'stats:', '  - value: 9%', '    label: cover'], ''),
      );
      expect(message).toContain('Expected at least 2 stats');
      expect(message).toContain('List 2 to 4 stats');
    }),
  );
  it.effect('fail a comparison row with fewer values than options, naming the row', () =>
    Effect.gen(function* () {
      const message = yield* failure(
        mdx(
          [
            'layout: comparison',
            'title: Which tree',
            'options:',
            '  - name: Pear',
            '  - name: Plane',
            '  - name: Lime',
            'rows:',
            '  - label: Cost',
            '    values: [$1, $2, $3]',
            '  - label: Shade',
            '    values: [true, false]',
          ],
          '',
        ),
      );
      expect(message).toContain('rows[1].values: Row "Shade" has 2 values for 3 options.');
      expect(message).toContain('one value per option');
    }),
  );

  it.effect('fail a comparison that recommends two options', () =>
    Effect.gen(function* () {
      const message = yield* failure(
        mdx(
          [
            'layout: comparison',
            'title: Which tree',
            'options:',
            '  - { name: Pear, recommended: true }',
            '  - { name: Plane, recommended: true }',
            'rows:',
            '  - { label: Cost, values: [$1, $2] }',
            '  - { label: Shade, values: [false, true] }',
          ],
          '',
        ),
      );
      expect(message).toContain('options: 2 options are recommended (Pear, Plane)');
    }),
  );

  for (const [layout, list, what, item] of [
    ['steps', 'steps', 'step', '{ title: Plant }'],
    ['agenda', 'items', 'item', '{ title: Why }'],
    ['timeline', 'milestones', 'milestone', '{ date: Q1 2026, title: Plant }'],
  ] as const) {
    it.effect(`fail a ${layout} slide whose current names a ${what} past the last`, () =>
      Effect.gen(function* () {
        const message = yield* failure(
          mdx(
            [
              `layout: ${layout}`,
              'title: The plan',
              `${list}:`,
              `  - ${item}`,
              `  - ${item}`,
              `  - ${item}`,
              'current: 5',
            ],
            '',
          ),
        );
        expect(message).toContain(`current: 5 names ${what} 5, but there are 3 ${what}s.`);
      }),
    );
  }
});
