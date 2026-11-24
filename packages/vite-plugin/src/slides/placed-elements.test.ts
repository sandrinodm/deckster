import { PLACED_SLOT } from '@deckster/engine/slots';
import { NodeFileSystem } from '@effect/platform-node';
import { Effect } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import { loadDeckBrand } from '#brand/load-deck-brand.ts';
import { DeckBuildError } from '#errors.ts';
import { FIXTURE_WORKSPACE } from '#layouts/brand-workspace.fixture.ts';
import { DEFAULT_LAYOUT_CATALOGS, loadLayoutCatalog } from '#layouts/load-layout-catalog.ts';
import { TEST_CATALOG } from '#layouts/test-catalog.fixture.ts';
import { slideBrandOf, type SlideBrand } from '#slides/check-surface.ts';
import { DEFAULT_PLACED_SPACING } from '#slides/placed-elements.ts';
import { readSlideMeta, transformMdxSlide, type SlideSource } from '#slides/transform-slide.ts';

const SLIDE_META_PATTERN = /export const slideMeta = (.*);\n$/;

const TEST_BRAND: SlideBrand = {
  name: 'demo',
  surfaces: ['default', 'inverse', 'accent'],
  spacing: DEFAULT_PLACED_SPACING,
  surfaceColors: {
    default: {
      bg: '#ffffff',
      surface: '#f4f4f5',
      fg: '#18181b',
      heading: '#09090b',
      muted: '#52525b',
      border: '#e4e4e7',
      accent: '#2563eb',
      'accent-fg': '#ffffff',
      positive: '#16a34a',
      negative: '#dc2626',
    },
    inverse: {
      bg: '#09090b',
      surface: '#18181b',
      fg: '#fafafa',
      heading: '#ffffff',
      muted: '#a1a1aa',
      border: '#27272a',
      accent: '#60a5fa',
      'accent-fg': '#09090b',
      positive: '#4ade80',
      negative: '#f87171',
    },
    accent: {
      bg: '#1d4ed8',
      surface: '#1e40af',
      fg: '#ffffff',
      heading: '#ffffff',
      muted: '#dbeafe',
      border: '#3b82f6',
      accent: '#facc15',
      'accent-fg': '#09090b',
      positive: '#86efac',
      negative: '#fca5a5',
    },
  },
};

function slide(code: string, overrides: Partial<SlideSource> = {}): SlideSource {
  const displayPath = 'decks/demo/slides/placed.mdx';
  return {
    id: 'placed',
    code,
    displayPath,
    file: `/workspace/${displayPath}`,
    layouts: TEST_CATALOG,
    brand: TEST_BRAND,
    ...overrides,
  };
}

function metaOf(code: string): Record<string, unknown> {
  const json = SLIDE_META_PATTERN.exec(code)?.[1];
  if (json === undefined) {
    throw new Error('the transformed slide has no slideMeta export');
  }

  return JSON.parse(json) as Record<string, unknown>;
}

function failMdx(code: string, overrides: Partial<SlideSource> = {}): Promise<unknown> {
  return Effect.runPromise(transformMdxSlide(slide(code, overrides), false)).then(
    () => {
      throw new Error('expected MDX compilation to fail');
    },
    (error: unknown) => error,
  );
}

describe('placed elements in MDX slides', () => {
  it('routes top-level Shape, Text and Place into __placed and records slideMeta.placed', async () => {
    const source = [
      '---',
      'title: Launch',
      '---',
      '',
      'Main body paragraph.',
      '',
      '<Shape place="top-right" width={4} surface="accent" name="Badge">',
      '  New in 0.9',
      '</Shape>',
      '',
      '<Shape shape="circle" place="top-left" width={2} surface="accent">',
      '  01',
      '</Shape>',
      '',
      '<Text place="bottom-left" zone="footer" inset="sm">',
      '  Source: Q3 survey',
      '</Text>',
      '',
      '<Place cols="9-12" rows="1-2">',
      '  - First takeaway',
      '</Place>',
    ].join('\n');

    const code = await Effect.runPromise(transformMdxSlide(slide(source), false));
    expect(code).toContain(`name: "${PLACED_SLOT}"`);
    expect(metaOf(code)).toMatchObject({
      title: 'Launch',
      slots: [],
      placed: [
        { kind: 'shape', name: 'Badge', place: 'top-right', width: 4 },
        { kind: 'shape', place: 'top-left', width: 2, aspect: 'square' },
        { kind: 'text', place: 'bottom-left', zone: 'footer', inset: 'sm' },
        { kind: 'place', cols: '9-12', rows: '1-2' },
      ],
    });

    const meta = await Effect.runPromise(readSlideMeta({ ...slide(source), kind: 'mdx' }));
    expect(meta.placed).toEqual(metaOf(code)['placed']);
  });

  it('records aspect="square" for square and circle shapes only', async () => {
    const source = [
      '<Shape shape="square" cols="1-2" surface="accent">S</Shape>',
      '',
      '<Shape shape="pill" place="top-right" width="sm" surface="accent">P</Shape>',
    ].join('\n');
    const meta = await Effect.runPromise(readSlideMeta({ ...slide(source), kind: 'mdx' }));
    expect(meta.placed).toEqual([
      { kind: 'shape', cols: '1-2', aspect: 'square' },
      { kind: 'shape', place: 'top-right', width: 'sm' },
    ]);
  });

  it('does not count placed elements as body content on a brand layout without a body region', async () => {
    const coverCatalog = Effect.gen(function* () {
      const { tokens } = yield* loadDeckBrand(FIXTURE_WORKSPACE, 'fx-brand');
      const [cover] = tokens.layouts;
      const brand = { ...tokens, layouts: [{ ...cover!, regions: [] }] };
      const layouts = yield* loadLayoutCatalog(DEFAULT_LAYOUT_CATALOGS, { brand });
      return { layouts, brand: slideBrandOf(tokens) };
    }).pipe(Effect.provide(NodeFileSystem.layer));

    const { layouts, brand } = await Effect.runPromise(coverCatalog);
    const source = [
      '---',
      'layout: fx-cover',
      'title: Hello',
      '---',
      '',
      '<Shape place="top-right" width={3} surface="accent">',
      '  Draft',
      '</Shape>',
      '',
      '<Text place="bottom-left" zone="footer">',
      '  Confidential',
      '</Text>',
    ].join('\n');

    const code = await Effect.runPromise(
      transformMdxSlide(slide(source, { layouts, brand }), false),
    );
    expect(code).toContain(`name: "${PLACED_SLOT}"`);
    expect(metaOf(code)).toMatchObject({
      title: 'Hello',
      slots: [],
      placed: [
        { kind: 'shape', place: 'top-right', width: 3 },
        { kind: 'text', place: 'bottom-left', zone: 'footer' },
      ],
    });
  });

  it('unwraps top-level <Step> around placed elements and copies at and effect', async () => {
    const singleLine = '<Step at={2} effect="fade"><Shape place="top-right" width={3} /></Step>';
    const code = await Effect.runPromise(transformMdxSlide(slide(singleLine), false));
    expect(code).toContain(`name: "${PLACED_SLOT}"`);
    expect(code).not.toContain('_jsx(Step,');
    expect(code).toMatch(/at:\s*2/);
    expect(code).toMatch(/effect:\s*"fade"/);
    expect(metaOf(code)['placed']).toEqual([{ kind: 'shape', place: 'top-right', width: 3 }]);

    const multiChild = [
      '<Step at={3} effect="fade">',
      '  <Shape place="top-right" effect="pop">One</Shape>',
      '  <Text place="bottom-left" zone="footer">Two</Text>',
      '</Step>',
    ].join('\n');
    const multiCode = await Effect.runPromise(transformMdxSlide(slide(multiChild), false));
    expect(multiCode).not.toContain('_jsx(Step,');
    expect(multiCode).toMatch(/effect:\s*"pop"/);
    expect(multiCode).toMatch(/effect:\s*"fade"/);
    expect(metaOf(multiCode)['placed']).toEqual([
      { kind: 'shape', place: 'top-right' },
      { kind: 'text', place: 'bottom-left', zone: 'footer' },
    ]);
  });

  it('leaves <Step> wrapping regular content untouched', async () => {
    const source = ['<Step at={1}>', '  - Bullet point', '</Step>'].join('\n');
    const code = await Effect.runPromise(transformMdxSlide(slide(source), false));
    expect(code).toContain('_jsx(Step,');
    expect(code).not.toContain(`name: "${PLACED_SLOT}"`);
    expect(metaOf(code)).not.toHaveProperty('placed');
  });

  it('keeps inline <Shape> and <Text> without placement props in body and slots', async () => {
    const source = [
      '---',
      'layout: split',
      '---',
      '',
      '<Left>',
      '  <Shape fill="muted">Hi</Shape>',
      '</Left>',
      '',
      '<Right>',
      '  <Text type="caption">Hi</Text>',
      '</Right>',
    ].join('\n');

    const code = await Effect.runPromise(transformMdxSlide(slide(source), false));
    expect(code).not.toContain(`name: "${PLACED_SLOT}"`);
    expect(metaOf(code)).not.toHaveProperty('placed');
    expect(metaOf(code)['slots']).toEqual(['left', 'right']);
  });

  it('skips shadowed Place, Shape and Text components imported by the slide', async () => {
    const source = [
      "import { Shape } from './custom-shape';",
      '',
      '<div>',
      '  <Shape place="top-right" />',
      '</div>',
    ].join('\n');
    const code = await Effect.runPromise(transformMdxSlide(slide(source), false));
    expect(code).not.toContain(`name: "${PLACED_SLOT}"`);
    expect(metaOf(code)).not.toHaveProperty('placed');
  });

  it('fails when a placed <Shape> or <Place> is nested inside a slot, list, div or another placed element', async () => {
    const inSlot = [
      '---',
      'layout: split',
      '---',
      '',
      '<Left>',
      '  <Shape place="top-right">Nope</Shape>',
      '</Left>',
      '',
      '<Right>Ok</Right>',
    ].join('\n');
    const slotError = await failMdx(inSlot);
    expect(slotError).toBeInstanceOf(DeckBuildError);
    expect(String(slotError)).toContain('<Shape> cannot be placed inside another element.');
    expect(String(slotError)).toContain(
      'Fix: Move <Shape> to the top level of the slide; placement is relative to the slide canvas.',
    );

    const inList = '- item <Place place="top-right">Nope</Place>';
    const listError = await failMdx(inList);
    expect(String(listError)).toContain('<Place> cannot be placed inside another element.');
    expect(String(listError)).toContain(
      'Fix: Move <Place> to the top level of the slide; placement is relative to the slide canvas.',
    );

    const inPlaced = [
      '<Place place="top-left">',
      '  <Text place="bottom-right">Nested</Text>',
      '</Place>',
    ].join('\n');
    const nestedPlacedError = await failMdx(inPlaced);
    expect(String(nestedPlacedError)).toContain('<Text> cannot be placed inside another element.');
    expect(String(nestedPlacedError)).toContain(
      'Fix: Move <Text> to the top level of the slide; placement is relative to the slide canvas.',
    );

    const mixedStep = [
      '<Step at={1}>',
      '  Normal text',
      '',
      '  <Shape place="top-right">Mixed</Shape>',
      '</Step>',
    ].join('\n');
    const mixedError = await failMdx(mixedStep);
    expect(String(mixedError)).toContain(
      'Fix: Move <Shape> to the top level of the slide; placement is relative to the slide canvas.',
    );
  });

  it('fails when <Place> has no placement prop', async () => {
    const error = await failMdx('<Place>Hello</Place>');
    expect(error).toBeInstanceOf(DeckBuildError);
    expect(String(error)).toContain('<Place> requires a placement prop.');
    expect(String(error)).toContain(
      'Fix: Add place="top-right", cols/rows, or box={[x, y, w, h]} to <Place>.',
    );
  });

  it('fails on non-literal placement props', async () => {
    const source = ['export const pos = "top-right";', '', '<Shape place={pos}>Hi</Shape>'].join(
      '\n',
    );
    const error = await failMdx(source);
    expect(error).toBeInstanceOf(DeckBuildError);
    expect(String(error)).toContain('prop "place" must be a static literal in MDX.');
    expect(String(error)).toContain(
      'Fix: Write placement props as literals in MDX, or use a TSX slide.',
    );

    const boxExpr = '<Shape box={[x, 80, 320, 120]}>Hi</Shape>';
    const boxError = await failMdx(boxExpr);
    expect(String(boxError)).toContain('prop "box" must be a static literal in MDX.');
  });

  it('fails on out-of-range grid cells and invalid pixel boxes', async () => {
    const badGrid = await failMdx('<Place cols="1-99" rows="1-2">Hi</Place>');
    expect(String(badGrid)).toContain('Invalid column range "1-99"');
    expect(String(badGrid)).toContain('Fix: Use a 1-based range within 1–12');

    const tooSmall = await failMdx('<Shape box={[100, 100, 10, 10]}>Tiny</Shape>');
    expect(String(tooSmall)).toContain('Fix:');

    const offCanvas = await failMdx('<Shape box={[1900, 100, 200, 100]}>Off</Shape>');
    expect(String(offCanvas)).toContain('Fix:');

    const negCanvas = await failMdx('<Shape box={[-50, 100, 200, 100]}>Neg</Shape>');
    expect(String(negCanvas)).toContain('Fix:');
  });

  it('fails on low-contrast <Shape fill="..."> without surface, and passes with surface or high contrast', async () => {
    const lowContrast = await failMdx('<Shape place="top-right" fill="fg" color="fg">Hi</Shape>');
    expect(lowContrast).toBeInstanceOf(DeckBuildError);
    expect(String(lowContrast)).toContain('1.00:1');
    expect(String(lowContrast)).toContain(
      'Fix: Use surface="accent" (or a contrasting color role) so text on fill="fg" meets 4.5:1 contrast.',
    );

    const defaultFgOnFg = await failMdx('<Shape place="top-right" fill="fg">Hi</Shape>');
    expect(String(defaultFgOnFg)).toContain('1.00:1');

    const highContrast = await Effect.runPromise(
      transformMdxSlide(
        slide('<Shape place="top-right" fill="surface" color="fg">Readable</Shape>'),
        false,
      ),
    );
    expect(metaOf(highContrast)['placed']).toEqual([{ kind: 'shape', place: 'top-right' }]);

    const withSurface = await Effect.runPromise(
      transformMdxSlide(
        slide('<Shape place="top-right" surface="accent" fill="fg" color="fg">Themed</Shape>'),
        false,
      ),
    );
    expect(metaOf(withSurface)['placed']).toEqual([{ kind: 'shape', place: 'top-right' }]);
  });
});
