import { describe, expect, it } from 'vite-plus/test';

import type { CategoricalData } from '#charts/data/rows.ts';

import { planDonut, sharePercent } from '#charts/donut/donut.tsx';
import { resolveFormat } from '#charts/format/number-format.ts';
import { TEST_THEME, testMeasure } from '#charts/frame/chart-theme.fixture.ts';
import { textBoxes } from '#charts/frame/scene.ts';

const CHANNELS: CategoricalData = {
  x: 'channel',
  categories: ['Chat', 'Email', 'Phone', 'Community'],
  series: [
    {
      key: 'conversations',
      label: 'conversations',
      values: [9360, 4860, 2340, 1440],
      at: undefined,
    },
  ],
};

/**
 * Plans the donut at a slide-sized plot.
 */
function plan(data: CategoricalData, highlight?: string, locale = 'en-US') {
  return planDonut({
    data,
    format: resolveFormat(undefined, undefined, { ...TEST_THEME.numbers, locale }),
    props: { data: [], ...(highlight === undefined ? {} : { highlight }) },
    input: { size: { width: 1600, height: 600 }, theme: TEST_THEME, measure: testMeasure },
  });
}

describe('sharePercent', () => {
  it('writes whole percentages, a decimal under 10%, in the locale', () => {
    expect(sharePercent(0.52, 'en-US')).toBe('52%');
    expect(sharePercent(0.08, 'en-US')).toBe('8%');
    expect(sharePercent(0.081, 'en-US')).toBe('8.1%');
    expect(sharePercent(0.081, 'de-DE')).toBe('8,1%');
  });
});

describe('planDonut', () => {
  it('gives every slice its share and counts the slices with a value as marks', () => {
    const { spec, facts } = plan(CHANNELS);
    expect(spec.series[0]?.labels).toEqual(['52%', '27%', '13%', '8%']);
    expect(facts).toMatchObject({ slices: 4, marks: 4, legendAvoidable: false });
  });

  it('writes the highlighted share once, in the centre, not again beside its slice', () => {
    const { scene } = plan(CHANNELS, 'Chat');
    const texts = textBoxes(scene, testMeasure).flatMap((entry) => entry.item.lines);
    expect(texts.filter((text) => text === '52%')).toHaveLength(1);
    expect(texts).toContain('27%');
  });

  it('writes shares in the brand locale', () => {
    const odd: CategoricalData = {
      ...CHANNELS,
      series: [{ ...CHANNELS.series[0]!, values: [9360, 4860, 2340, 1500] }],
    };
    expect(plan(odd, undefined, 'de-DE').spec.series[0]?.labels[3]).toBe('8,3%');
    expect(plan(odd).spec.series[0]?.labels[3]).toBe('8.3%');
  });

  it('counts a missing value as an empty slice, not a mark', () => {
    const gappy: CategoricalData = {
      ...CHANNELS,
      series: [{ ...CHANNELS.series[0]!, values: [9360, null, 2340, 1440] }],
    };
    expect(plan(gappy).facts.marks).toBe(3);
  });

  it('moves its labels under the ring in a narrow column, and keeps the centre caption whole', () => {
    const narrow = planDonut({
      data: CHANNELS,
      format: resolveFormat(undefined, undefined, TEST_THEME.numbers),
      props: { data: [], highlight: 'Chat', centerLabel: 'of conversations on chat' },
      input: { size: { width: 640, height: 860 }, theme: TEST_THEME, measure: testMeasure },
    });
    const items = narrow.scene.layers.flatMap((layer) => layer.items);
    const ring = items.find((item) => item.kind === 'path' && item.mark === true);
    const names = items.filter(
      (item) => item.kind === 'text' && CHANNELS.categories.includes(item.lines[0] ?? ''),
    );
    expect(ring?.kind === 'path' ? ring.strokeWidth : 0).toBeGreaterThan(70);
    // Every name sits under the ring, one row each, and the caption is not cut.
    const tops = names.map((item) => (item.kind === 'text' ? item.y : 0));
    expect(Math.min(...tops)).toBeGreaterThan(560);
    expect(new Set(tops).size).toBe(4);
    expect(items.some((item) => item.kind === 'text' && item.cut !== undefined)).toBe(false);
    // In a wide plot the labels stay beside the ring.
    const wide = plan(CHANNELS, 'Chat').scene.layers.flatMap((layer) => layer.items);
    expect(wide.some((item) => item.kind === 'circle')).toBe(false);
  });
});
