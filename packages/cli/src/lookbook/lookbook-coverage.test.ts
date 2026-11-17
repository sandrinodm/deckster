import { FRAMEWORK_ROOT } from '@deckster/brand/node';
import { loadLayoutCatalog } from '@deckster/vite-plugin';
import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import path from 'node:path';

import { describeCatalog } from '#layouts/list-layouts.ts';
import { coverageGaps, kitCatalog, readSlide, readSlides } from '#lookbook/lookbook-coverage.ts';

/**
 * The lookbook's slide folder.
 */
const LOOKBOOK_SLIDES = path.join(FRAMEWORK_ROOT, 'decks', 'lookbook', 'slides');

describe('the lookbook deck', () => {
  it.effect(
    'shows every layout, option, surface, transition, step effect, chart, diagram and component',
    () =>
      Effect.gen(function* () {
        const { layouts } = describeCatalog(yield* loadLayoutCatalog());
        const catalog = kitCatalog(layouts);
        const gaps = coverageGaps(catalog, readSlides(LOOKBOOK_SLIDES, catalog.defaultEffect));
        expect(gaps, `The lookbook lacks ${gaps.length} items`).toEqual([]);
      }),
  );
});

describe('readSlide', () => {
  it('reads nested frontmatter, elements outside the notes, fences, effects and morphs', () => {
    const facts = readSlide(
      'demo.mdx',
      [
        '---',
        'layout: split',
        'side: left',
        'stats:',
        '  - value: 3',
        '---',
        '',
        '<Step at={1} effect="wipe" focus>',
        '',
        '```ts',
        'const a = 1;',
        '```',
        '',
        '</Step>',
        '',
        '<Step at={2}>![A street](../assets/street.jpg)</Step>',
        '',
        '<Morph id="street"><Icon name="bike" /></Morph>',
        '',
        '<Notes>',
        'Mentions `<BarChart>` but does not show one.',
        '<Pictogram value={3} total={10} />',
        '</Notes>',
      ].join('\n'),
      'rise',
    );
    expect(facts).toMatchObject({
      kind: 'read',
      frontmatter: { layout: 'split', side: 'left', stats: [{ value: 3 }] },
      focus: true,
    });
    expect(facts.kind === 'read' && [...facts.tags].toSorted()).toEqual([
      'Code',
      'Icon',
      'Image',
      'Morph',
      'Notes',
      'Step',
    ]);
    expect(facts.kind === 'read' && [...facts.effects].toSorted()).toEqual(['rise', 'wipe']);
    expect(facts.kind === 'read' && [...facts.morphs]).toEqual(['street']);
  });

  it('reads the frontmatter literal and the elements of a TSX slide', () => {
    const facts = readSlide(
      'demo.tsx',
      [
        "export const frontmatter = { layout: 'demo', title: 'A live widget', surface: 'inverse' } satisfies object;",
        'export default function Slide() {',
        '  return <><Live component={Counter} /><Step at={1} effect="blur">x</Step></>;',
        '}',
      ].join('\n'),
      'rise',
    );
    expect(facts).toMatchObject({
      kind: 'read',
      frontmatter: { layout: 'demo', title: 'A live widget', surface: 'inverse' },
    });
    expect(facts.kind === 'read' && [...facts.tags].toSorted()).toEqual(['Live', 'Step']);
    expect(facts.kind === 'read' && [...facts.effects]).toEqual(['blur']);
  });

  it('reports a slide that does not parse instead of throwing', () => {
    expect(readSlide('half.mdx', '---\nlayout: content\n', 'rise')).toMatchObject({
      kind: 'unreadable',
      problem: expect.stringContaining('never closed'),
    });
  });
});
