import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { Schema } from 'effect';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vite-plus/test';

import catalog from '#catalog.ts';
import { LIMIT_CASES } from '#layouts/limit-cases.ts';
import {
  MARKET_LABEL_MAX_CHARS,
  MARKET_NOTE_MAX_CHARS,
  MARKET_VALUE_MAX_CHARS,
  MARKET_SHARE_LABEL_MAX_CHARS,
  DEFAULT_MARKET_LABELS,
  marketAmount,
  marketLayoutContract,
  marketProblems,
} from '#layouts/market-layout.contract.ts';
import { marketCircles, marketLayout } from '#layouts/market-layout.tsx';

/**
 * Reveal state is independent of static entrances, as it is in the engine's screenshot mode.
 */
const view = vi.hoisted(() => ({ step: 0, surface: 'default' }));

vi.mock('@deckster/engine', async (original) => ({
  ...(await original<typeof import('@deckster/engine')>()),
  useStatic: () => true,
  useStepAt: (at: number) => (view.step < at ? 'hidden' : 'current'),
  useSlide: () => ({ state: 'current' }),
  useReadyHold: () => undefined,
}));

vi.mock('@deckster/brand/runtime', () => ({
  useBrand: () => ({ surface: { name: view.surface } }),
}));

vi.mock('#foundation/backdrop.tsx', () => ({ Backdrop: () => null }));

/**
 * A complete outer market size.
 */
const SIZE = { label: 'TAM', value: '€3.0B', note: 'Annual city delivery spend' };

/**
 * Renders the real layout and Step markup, retaining hidden content for a stable fit.
 *
 * @param sizes - The exact figures to draw, or equal scopes to exercise the text ladder.
 */
function renderMarket(sizes: readonly (typeof SIZE)[]): string {
  return renderToStaticMarkup(
    createElement(marketLayout.component, {
      slideId: 'market-test',
      frontmatter: {
        layout: 'market',
        title: 'Our first market',
        sizes,
        reveal: true,
        chrome: true,
        labels: DEFAULT_MARKET_LABELS,
      },
      slots: { footnote: 'Source line' },
    }),
  );
}

/**
 * Decodes frontmatter exactly as the build does, rejecting unknown nested fields too.
 *
 * @param frontmatter - The slide fields without `layout`.
 */
function decode(frontmatter: Record<string, unknown>): unknown {
  const schema = Schema.Struct({
    ...SlideFrontmatter.fields,
    ...marketLayoutContract.schema.fields,
  });
  return Schema.decodeUnknownSync(schema)(
    { layout: 'market', ...frontmatter },
    { onExcessProperty: 'error' },
  );
}

describe('the market layout contract', () => {
  it('takes two or three sizes, preserving outermost-first order', () => {
    const sizes = [SIZE, { ...SIZE, label: 'SAM' }, { ...SIZE, label: 'SOM' }];
    expect(decode({ sizes })).toMatchObject({ sizes });
    expect(() => decode({ sizes: sizes.slice(0, 2) })).not.toThrow();
    expect(() => decode({ sizes: [SIZE] })).toThrow('at least 2 market sizes');
    expect(() => decode({ sizes: [...sizes, SIZE] })).toThrow('at most 3 market sizes');
  });

  it('uses finite numeric values or displayed figures with currency and units', () => {
    expect(decode({ sizes: [SIZE, { ...SIZE, value: 640000 }] })).toMatchObject({
      sizes: [{ value: '€3.0B' }, { value: 640000 }],
    });
    for (const value of [Infinity, NaN, 'x'.repeat(MARKET_VALUE_MAX_CHARS + 1), '']) {
      expect(() => decode({ sizes: [SIZE, { ...SIZE, value }] })).toThrow('sizes');
    }
  });

  it('accepts standard market names without abbreviations', () => {
    const sizes = ['Addressable market', 'Serviceable market', 'Obtainable market'].map(
      (label) => ({ ...SIZE, label }),
    );
    expect(decode({ sizes })).toMatchObject({ sizes });
  });

  it('requires labels and notes and enforces every text boundary', () => {
    for (const [field, max] of [
      ['label', MARKET_LABEL_MAX_CHARS],
      ['note', MARKET_NOTE_MAX_CHARS],
      ['value', MARKET_VALUE_MAX_CHARS],
    ] as const) {
      expect(() => decode({ sizes: [SIZE, { ...SIZE, [field]: 'x'.repeat(max) }] })).not.toThrow();
      expect(() => decode({ sizes: [SIZE, { ...SIZE, [field]: 'x'.repeat(max + 1) }] })).toThrow(
        `at most ${max} characters`,
      );
      expect(() => decode({ sizes: [SIZE, { ...SIZE, [field]: '' }] })).toThrow(field);
      expect(() => decode({ sizes: [SIZE, { ...SIZE, [field]: undefined }] })).toThrow(field);
    }
  });

  it('shows chrome and the whole market by default, and can reveal outside in', () => {
    expect(decode({ sizes: [SIZE, SIZE] })).toMatchObject({ reveal: false, chrome: true });
    expect(decode({ sizes: [SIZE, SIZE], reveal: true, chrome: false })).toMatchObject({
      reveal: true,
      chrome: false,
    });
  });

  it('defaults each share label independently and bounds custom wording', () => {
    for (const fields of [{}, { labels: {} }]) {
      expect(decode({ sizes: [SIZE, SIZE], ...fields })).toMatchObject({
        labels: DEFAULT_MARKET_LABELS,
      });
    }

    expect(decode({ sizes: [SIZE, SIZE], labels: { share: '{share} de {parent}' } })).toMatchObject(
      {
        labels: { share: '{share} de {parent}', minimum: 'Marker enlarged' },
      },
    );
    expect(() =>
      decode({
        sizes: [SIZE, SIZE],
        labels: { share: 'x'.repeat(MARKET_SHARE_LABEL_MAX_CHARS + 1) },
      }),
    ).toThrow('at most');
  });

  it('rejects unknown fields rather than losing an author’s annotation', () => {
    expect(() => decode({ sizes: [SIZE, SIZE], highlight: true })).toThrow('Expected no excess');
    expect(() => decode({ sizes: [SIZE, { ...SIZE, colour: 'red' }] })).toThrow(
      'Expected no excess',
    );
  });

  it('registers with native PowerPoint placeholders and stress cases at both boundaries', () => {
    expect(catalog.layouts.map((layout) => layout.name)).toContain('market');
    expect(marketLayoutContract.pptx).toMatchObject({
      type: 'title-only',
      placeholders: [{ kind: 'title' }, { kind: 'body' }],
    });
    expect(LIMIT_CASES.market?.map((entry) => entry.name)).toEqual([
      '2-sizes',
      '2-sizes-bare',
      '2-sizes-close',
      '2-sizes-tiny',
      '2-sizes-short-title',
      '3-sizes',
      '3-sizes-bare',
      '3-sizes-close',
      '3-sizes-tiny',
      '3-sizes-short-title',
    ]);
    for (const entry of LIMIT_CASES.market ?? []) {
      expect(() => decode(entry.frontmatter)).not.toThrow();
      expect(marketProblems(entry.frontmatter.sizes as (typeof SIZE)[])).toEqual([]);
    }
  });

  it('reads compact magnitudes and thousands separators in a common base unit', () => {
    expect(marketAmount('€3.0B')).toEqual({ amount: 3_000_000_000, unit: '€' });
    expect(marketAmount('$640k')).toEqual({ amount: 640_000, unit: '$' });
    expect(marketAmount('$640,000')).toEqual({ amount: 640_000, unit: '$' });
    expect(marketAmount('7,000')).toEqual({ amount: 7000, unit: '' });
    expect(marketAmount(1e-9)).toEqual({ amount: 1e-9, unit: '' });
    for (const value of [
      0,
      -1,
      NaN,
      Infinity,
      '0M',
      '-1M',
      '~1M',
      '1–2M',
      '1,2M',
      '1.2.3M',
      '3bn',
      'Soon',
    ]) {
      expect(marketAmount(value)).toBeUndefined();
    }
  });

  it('rejects incomparable figures and impossible nesting through the contract checks', () => {
    for (const value of ['$1B', '€4B']) {
      const sizes = [SIZE, { ...SIZE, value }];
      expect(marketProblems(sizes)).toHaveLength(1);
      const frontmatter = Schema.decodeUnknownSync(marketLayoutContract.schema)({ sizes });
      expect(marketLayoutContract.checks?.(frontmatter)).toHaveLength(1);
    }

    expect(marketProblems([SIZE, SIZE])).toEqual([]);
    expect(marketProblems([SIZE, { ...SIZE, value: '~1B' }])).toEqual([]);
    expect(marketCircles([SIZE, { ...SIZE, value: '~1B' }])).toBeUndefined();
  });

  it('encodes area rather than width and keeps tiny segments visible with their true share', () => {
    const circles = marketCircles([SIZE, { ...SIZE, value: '€1B' }, { ...SIZE, value: '€18.6M' }]);
    expect(circles?.[0]?.diameter).toBe(1);
    expect((circles?.[1]?.diameter ?? 0) ** 2).toBeCloseTo(1 / 3);
    expect((circles?.[2]?.diameter ?? 0) ** 2).toBeCloseTo(18.6 / 3000);
    expect(circles?.[2]).toMatchObject({ callout: true, parentShare: 0.0186 });
    const tiny = marketCircles([SIZE, { ...SIZE, value: '€1' }]);
    expect(tiny?.[1]?.diameter).toBe(0.06);
    expect(tiny?.[1]?.share).toBeCloseTo(1 / 3_000_000_000);
  });

  it('uses a typographic ladder when scopes are too close to label distinctly', () => {
    expect(marketCircles([SIZE, SIZE])).toBeUndefined();
    expect(marketCircles([SIZE, { ...SIZE, value: '€2.9B' }])).toBeUndefined();
    expect(marketCircles([SIZE, { ...SIZE, value: '€4B' }])).toBeUndefined();
  });

  it('retains nested circles for successive small shares and a four-percent middle scope', () => {
    for (const values of [
      ['€10B', '€190M', '€3.6M'],
      ['€3B', '€120M', '€30M'],
    ]) {
      const circles = marketCircles(values.map((value) => ({ ...SIZE, value })));
      expect(circles).toHaveLength(3);
      expect(circles?.[1]?.diameter).toBeLessThan(circles?.[0]?.diameter ?? 0);
      expect(circles?.[2]?.diameter).toBeLessThan(circles?.[1]?.diameter ?? 0);
      expect(circles?.[1]?.labelY).toBeLessThan(circles?.[2]?.labelY ?? 0);
    }

    const tiny = renderMarket([SIZE, { ...SIZE, value: '€1' }]);
    expect(tiny).toContain('Marker enlarged');
    expect(tiny).toContain('&lt;0.1% of €3.0B');
  });

  it('keeps the source visible at zero while revealing circles and figures outside in', () => {
    const sizes = [
      SIZE,
      { ...SIZE, label: 'SAM', value: '€1B' },
      { ...SIZE, label: 'SOM', value: '€18.6M' },
    ];
    view.surface = 'default';
    view.step = 0;
    const first = renderMarket(sizes);
    expect(first.match(/data-step-state="hidden"/gu)).toHaveLength(6);
    expect(first).toContain('1.9% of €1B');
    expect(first).toMatch(/<div class="kit-footnote[^>]*>Source line<\/div>/u);
    expect(first).not.toContain('kit-counting-number');
    view.step = 2;
    expect(renderMarket(sizes).match(/data-step-state="hidden"/gu)).toHaveLength(2);
    view.step = 3;
    const last = renderMarket(sizes);
    expect(last).not.toContain('data-step-state="hidden"');
    expect(last).toContain('Source line');
  });

  it('flips accent targets and keeps native list figures in the ladder', () => {
    view.surface = 'accent';
    view.step = 2;
    const html = renderMarket([SIZE, SIZE]);
    expect(html).toContain('data-drawing="ladder"');
    expect(html).not.toContain('kit-market-picture');
    expect(html).toContain('kit-market-size" data-surface="inverse"');
    expect(html.match(/<li class="kit-market-entry"/gu)).toHaveLength(2);
    expect(html.match(/<h3 /gu)).toHaveLength(2);
    view.surface = 'default';
  });
});
