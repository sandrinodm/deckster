import type { BrandLayoutTokens, BrandTokens } from '@deckster/brand';
import type { AnyLayoutContract } from '@deckster/engine/layout';

import { describe, expect, it } from 'vite-plus/test';

import { slideInput } from '#pptx/deck.fixture.ts';
import { layoutPlaceholders, masterSpecs, matchesSource } from '#pptx/layout-specs.ts';
import { surfaceThemeFixture } from '#pptx/theme.fixture.ts';
import { line, paragraph, run, runStyle, textNode } from '#scene/scene.fixture.ts';

/**
 * The parts of a brand the layout specs read.
 */
function brand(): BrandTokens {
  return {
    layouts: [],
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
    const placeholders = layoutPlaceholders('title', [
      { kind: 'title', from: { selector: '.kit-title' } },
      { kind: 'subtitle', from: { slot: 'subtitle' } },
      { kind: 'body', from: { slot: 'body' } },
    ]);
    expect(placeholders.map(({ ref }) => ref)).toEqual([
      { type: 'ctrTitle', idx: undefined },
      { type: 'subTitle', idx: 1 },
      { type: 'body', idx: 2 },
    ]);
  });

  it('assigns each body a distinct index and numbers the picture after them', () => {
    const placeholders = layoutPlaceholders('two-content', [
      { kind: 'title', from: { selector: '.kit-title' } },
      { kind: 'body', from: { slot: 'body' } },
      { kind: 'body', from: { slot: 'aside' } },
      { kind: 'picture', from: { slot: 'media' } },
    ]);
    expect(placeholders.map(({ ref }) => ref)).toEqual([
      { type: 'title', idx: undefined },
      { type: 'body', idx: 1 },
      { type: 'body', idx: 2 },
      { type: 'pic', idx: 3 },
    ]);
  });

  it('uses each brand region box, measures each body separately and keeps the layout label', () => {
    const layout = {
      name: 'brand-photo',
      label: 'Brand photo',
      title: { box: [10, 20, 300, 100] },
      regions: [
        { bind: { slot: 'body' }, kind: 'text', box: [10, 200, 300, 400] },
        { bind: { slot: 'aside' }, kind: 'text', box: [400, 200, 300, 400] },
        { bind: { slot: 'media' }, kind: 'media', box: [800, 0, 500, 600] },
      ],
      layers: {},
    } as unknown as BrandLayoutTokens;
    const contract = {
      name: 'brand-photo',
      pptx: {
        type: 'two-content',
        placeholders: [
          { kind: 'title', from: { selector: '.kit-brand-title' } },
          { kind: 'body', from: { slot: 'body' } },
          { kind: 'body', from: { slot: 'aside' } },
          { kind: 'picture', from: { slot: 'media' } },
        ],
      },
    } as unknown as AnyLayoutContract;
    const left = textNode(1, paragraph([line('Body', 240)]));
    const asideRun = run('Aside', { style: runStyle({ color: '#987654' }) });
    const right = textNode(2, paragraph([line('Aside', 240, { runs: [asideRun] })]), {
      slot: 'aside',
    });
    const slide = slideInput(0, [left, right], { layout: 'brand-photo' });
    const [master] = masterSpecs(
      { layouts: [contract], slides: [slide], brand: { ...brand(), layouts: [layout] } },
      { themes: [surfaceThemeFixture()], font: undefined },
    );
    const spec = master?.layouts[0];
    expect(spec?.label).toBe('Brand photo');
    expect(spec?.placeholders.map((placeholder) => placeholder.rect)).toEqual([
      { x: 10, y: 20, width: 300, height: 100 },
      { x: 10, y: 200, width: 300, height: 400 },
      { x: 400, y: 200, width: 300, height: 400 },
      { x: 800, y: 0, width: 500, height: 600 },
    ]);
    expect(
      spec?.placeholders.slice(1, 3).map((placeholder) => placeholder.defaults?.color),
    ).toEqual(['#161920', '#987654']);
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
