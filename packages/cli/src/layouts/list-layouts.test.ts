import { NodeFileSystem } from '@effect/platform-node';
import { describe, expect, it, layer } from '@effect/vitest';
import { Effect } from 'effect';

import { exampleMdx, listLayouts } from '#layouts/list-layouts.ts';
import { WORKSPACE_ROOT } from '#workspace.ts';

layer(NodeFileSystem.layer)('listLayouts', (it) => {
  it.effect('prints the full contract of every layout the hello deck can use', () =>
    Effect.gen(function* () {
      const catalog = yield* listLayouts(WORKSPACE_ROOT, 'hello');
      expect(catalog.slideFrontmatter).toMatchObject({
        type: 'object',
        additionalProperties: false,
      });
      expect(Object.keys(catalog.slideFrontmatter.properties ?? {})).toEqual([
        'layout',
        'title',
        'surface',
        'background',
        'budget',
      ]);
      const layout = catalog.layouts.find((entry) => entry.name === 'default');
      expect(layout).toMatchObject({
        source: '@deckster/kit',
        frontmatter: { type: 'object', properties: {}, additionalProperties: false },
        slots: { body: { tag: null, required: true } },
        budget: { body: { maxWords: 80, maxBullets: 6 } },
        variants: [],
        title: null,
        surface: null,
        pptx: { type: 'content', placeholders: expect.any(Array) },
      });
      expect(layout?.example.mdx).toMatch(/^---\nlayout: default\ntitle: How steps work\n/);
    }),
  );

  it.effect(
    'prints each field with its default and choices, the title limit and the variants',
    () =>
      Effect.gen(function* () {
        const catalog = yield* listLayouts(WORKSPACE_ROOT, 'hello');
        const split = catalog.layouts.find((entry) => entry.name === 'split');
        expect(split?.fields['ratio']).toEqual({
          required: false,
          default: '1:1',
          allowed: ['1:1', '5:7', '7:5'],
          hint: expect.stringContaining('ratio: 5:7'),
        });
        expect(split?.fields['bleed']).toMatchObject({ default: false, allowed: [true, false] });
        expect(split?.fields['chrome']).toMatchObject({ default: true });
        expect(split?.frontmatter).toMatchObject({ properties: { side: { default: 'right' } } });
        expect(split?.title).toEqual({ required: true, maxChars: expect.any(Number) });
        expect(split?.variants.map((variant) => variant.name)).toContain('ratio 5:7');
        const section = catalog.layouts.find((entry) => entry.name === 'section');
        expect(section).toMatchObject({
          surface: 'accent',
          fields: { chrome: { default: false } },
        });
        const stats = catalog.layouts.find((entry) => entry.name === 'stats');
        expect(stats?.fields['stats']).toMatchObject({ required: true, default: null });
      }),
  );

  it.effect('names the deck that does not exist', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(listLayouts(WORKSPACE_ROOT, 'nope'));
      expect(error.message).toContain('There is no decks/nope/deck.config.ts.');
    }),
  );
});

describe('exampleMdx', () => {
  it('writes lists of fields as block YAML, one field per line, with the comments last', () => {
    const mdx = exampleMdx(
      {
        layout: 'agenda',
        title: 'Today',
        current: 2,
        items: [
          { title: 'Why Eastgate', time: '5 min' },
          { title: 'The ask: a capital line', detail: 'Three posts' },
        ],
        tags: ['a', 'b'],
        empty: [],
      },
      'Body.',
      ['photo: ../assets/dana.jpg'],
    );
    expect(mdx).toBe(
      [
        '---',
        'layout: agenda',
        'title: Today',
        'current: 2',
        'items:',
        '  - title: Why Eastgate',
        '    time: 5 min',
        '  - title: "The ask: a capital line"',
        '    detail: Three posts',
        'tags:',
        '  - a',
        '  - b',
        'empty: []',
        '# photo: ../assets/dana.jpg',
        '---',
        '',
        'Body.',
        '',
      ].join('\n'),
    );
  });
});
