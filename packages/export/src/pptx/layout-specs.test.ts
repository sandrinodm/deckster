import type { BrandTokens } from '@deckster/brand';
import type { AnyLayoutContract } from '@deckster/engine/layout';

import { describe, expect, it } from 'vite-plus/test';

import { masterSpecs, matchesSource, placeholderRefs } from '#pptx/layout-specs.ts';
import { surfaceThemeFixture } from '#pptx/theme.fixture.ts';
import { line, paragraph, textNode } from '#scene/scene.fixture.ts';

/**
 * The parts of a brand the layout specs read.
 */
function brand(): BrandTokens {
  return {
    spacing: { margin: { x: 128, y: 112 }, scale: { lg: 40 } },
    typography: {
      scale: { headline: { size: 80, lineHeight: 1.02 } },
      families: { display: { family: 'Bricolage Grotesque' }, body: { family: 'Inter' } },
    },
  } as unknown as BrandTokens;
}

/**
 * A title layout and a statement layout whose title is not drawn.
 */
const CONTRACTS = [
  {
    name: 'title',
    pptx: {
      type: 'title',
      placeholders: [
        { kind: 'title', from: { selector: '.kit-cover-title' } },
        { kind: 'subtitle', from: { slot: 'body' } },
      ],
    },
  },
  {
    name: 'statement',
    pptx: {
      type: 'content',
      placeholders: [
        { kind: 'title', from: { field: 'title' } },
        { kind: 'body', from: { slot: 'body' } },
      ],
    },
  },
  { name: 'demo' },
] as unknown as AnyLayoutContract[];

describe('placeholder mapping', () => {
  it('names a title slide title ctrTitle and numbers the other placeholders', () => {
    const refs = placeholderRefs('title', ['title', 'subtitle', 'body']);
    expect([...refs.values()]).toEqual([
      { type: 'ctrTitle', idx: undefined },
      { type: 'subTitle', idx: 1 },
      { type: 'body', idx: 2 },
    ]);
    expect(placeholderRefs('content', ['title']).get('title')).toEqual({
      type: 'title',
      idx: undefined,
    });
  });

  it('matches frames by slot and by selector', () => {
    const subtitle = textNode(1, paragraph([line('Sub', 140)]), { slot: 'body' });
    const title = textNode(2, paragraph([line('Title', 300)]), {
      slot: null,
      matches: ['.kit-cover-title'],
    });
    expect(matchesSource(subtitle, { slot: 'body' })).toBe(true);
    expect(matchesSource(title, { selector: '.kit-cover-title' })).toBe(true);
    expect(matchesSource(title, { slot: 'body' })).toBe(false);
  });

  it('gives a master without slides the basic layouts the deck has, placed in the margins', () => {
    const [master] = masterSpecs(
      { layouts: CONTRACTS, slides: [], brand: brand() },
      { themes: [surfaceThemeFixture()], font: undefined },
    );
    expect(
      master?.layouts.map((spec) => [
        spec.name,
        spec.type,
        spec.placeholders.map((placeholder) => placeholder.ref.type),
      ]),
    ).toEqual([
      ['title', 'title', ['ctrTitle', 'subTitle']],
      ['statement', 'content', ['title', 'body']],
    ]);
    const statementTitle = master?.layouts[1]?.placeholders[0];
    expect(statementTitle?.rect.y).toBeLessThan(0);
    expect(master?.layouts[0]?.placeholders[0]?.rect).toMatchObject({ x: 128, y: 112 });
    expect(master?.chrome).toEqual([]);
  });
});
