import { describe, expect, it } from 'vite-plus/test';

import type { CategoricalData } from '#charts/data/rows.ts';

import { resolveFormat } from '#charts/format/number-format.ts';
import { annotationSpecs, resolveAnnotations, toneOf } from '#charts/insight/annotations.ts';
import { isHighlighted, resolveHighlight } from '#charts/insight/highlight.ts';

const DATA: CategoricalData = {
  x: 'month',
  categories: ['May', 'Jun', 'Jul', 'Aug', 'Sep'],
  series: [
    { key: '2025', label: '2025', values: [6300, 6400, 6600, 6500, 6700], at: undefined },
    { key: '2026', label: 'This year', values: [7400, 7100, 5900, 5100, 4600], at: undefined },
  ],
};

const FORMAT = resolveFormat(undefined, undefined, {
  locale: 'en-US',
  notation: 'compact',
  currency: 'USD',
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});

describe('resolveHighlight', () => {
  it('reads a bare name as a series when one has that key or label', () => {
    const highlight = resolveHighlight('This year', DATA);
    expect([...highlight.series]).toEqual(['2026']);
    expect(highlight.spec.series).toEqual(['This year']);
    expect(isHighlighted(highlight, '2026', 0)).toBe(true);
    expect(isHighlighted(highlight, '2025', 0)).toBe(false);
  });

  it('reads other names and keywords as categories in every series', () => {
    const highlight = resolveHighlight(['Jun', 'max'], { ...DATA, series: [DATA.series[1]!] });
    expect([...highlight.categories]).toEqual([1, 0]);
    expect(isHighlighted(highlight, '2026', 1)).toBe(true);
    expect(isHighlighted(highlight, '2026', 2)).toBe(false);
  });

  it('resolves points, ranges and the step', () => {
    const highlight = resolveHighlight(
      { point: { series: '2025', category: 'Aug' }, range: ['Sep', 'Jul'], at: 3 },
      DATA,
    );
    expect(highlight.at).toBe(3);
    expect(highlight.range).toEqual([2, 4]);
    expect(highlight.spec.points).toEqual([{ series: '2025', category: 'Aug' }]);
    expect(isHighlighted(highlight, '2025', 3)).toBe(true);
  });

  it('highlights everything when there is no highlight', () => {
    const highlight = resolveHighlight(undefined, DATA);
    expect(highlight.active).toBe(false);
    expect(isHighlighted(highlight, '2025', 0)).toBe(true);
  });

  it('names the series and categories when a name matches neither', () => {
    expect(() => resolveHighlight({ category: 'Dec' }, DATA)).toThrow(
      'Its categories are: May, Jun',
    );
    expect(() => resolveHighlight({ series: 'EU' }, DATA)).toThrow(
      'Its series are: 2025, This year',
    );
  });
});

describe('resolveAnnotations', () => {
  it('points a callout at the default series value', () => {
    const [callout] = resolveAnnotations([{ type: 'callout', x: 'Jun', label: 'Ships' }], DATA, {
      format: FORMAT,
      series: '2026',
    });
    expect(callout).toMatchObject({ type: 'callout', index: 1, value: 7100, series: '2026' });
  });

  it('labels a bracket with the relative change and tones it by which way is better', () => {
    const [down] = resolveAnnotations(
      [{ type: 'bracket', from: 'May', to: 'Sep', better: 'down' }],
      DATA,
      { format: FORMAT, series: '2026' },
    );
    expect(down).toMatchObject({ type: 'bracket', label: '−38%', tone: 'positive' });
    const [up] = resolveAnnotations(
      [{ type: 'bracket', from: 'May', to: 'Sep', relative: false }],
      DATA,
      { format: FORMAT, series: '2026' },
    );
    expect(up).toMatchObject({ label: '−2,800', tone: 'negative' });
  });

  it('writes a reference line label with its value and orders a range', () => {
    const notes = resolveAnnotations(
      [
        { type: 'reference', value: 4000, label: 'Target' },
        { type: 'range', from: 'Sep', to: 'Jul', at: 2 },
      ],
      DATA,
      { format: FORMAT, series: undefined },
    );
    expect(notes[0]).toMatchObject({ label: 'Target 4,000' });
    expect(notes[1]).toMatchObject({ from: 2, to: 4, at: 2 });
    expect(annotationSpecs(notes, DATA)[1]).toEqual({
      type: 'range',
      label: '',
      from: 'Jul',
      to: 'Sep',
    });
  });

  it('fails on a category the chart does not have', () => {
    expect(() =>
      resolveAnnotations([{ type: 'callout', x: 'Dec', label: 'x' }], DATA, {
        format: FORMAT,
        series: undefined,
      }),
    ).toThrow('"Dec" is not a category');
  });
});

describe('toneOf', () => {
  it('is good news when the change goes the better way', () => {
    expect(toneOf(-3, 'down')).toBe('positive');
    expect(toneOf(-3, 'up')).toBe('negative');
    expect(toneOf(0, 'up')).toBe('neutral');
  });
});

describe('names that are properties of every object', () => {
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'does not take `%s` for a series, a category or an annotation field',
    (name) => {
      expect(() => resolveHighlight(name, DATA)).toThrow(name);
      expect(() => resolveHighlight({ series: name }, DATA)).toThrow(name);
      expect(() =>
        resolveAnnotations([{ type: 'callout', x: name, label: 'x' }], DATA, {
          format: FORMAT,
          series: undefined,
        }),
      ).toThrow(name);
    },
  );
});
