import { describe, expect, it } from 'vite-plus/test';

import { BAR_CHART_PROPS } from '#charts/bar/bar-chart.tsx';
import { CHART_INFOS, CHART_LIMITS, chartCatalog, chartPropNames } from '#charts/chart-catalog.ts';
import { CHART_COMPONENTS } from '#charts/chart-components.ts';
import { DONUT_PROPS } from '#charts/donut/donut.tsx';
import { BIG_NUMBER_PROPS } from '#charts/figures/big-number.tsx';
import { COMPARISON_PROPS } from '#charts/figures/comparison.tsx';
import { TABLE_PROPS } from '#charts/figures/data-table.tsx';
import { PICTOGRAM_PROPS } from '#charts/figures/pictogram.tsx';
import { PROGRESS_PROPS } from '#charts/figures/progress.tsx';
import { STAT_ROW_PROPS } from '#charts/figures/stat-row.tsx';
import { checkProps, closestProp } from '#charts/frame/check-props.ts';
import { REVEAL_BY } from '#charts/frame/reveal.ts';
import { FUNNEL_PROPS } from '#charts/funnel/funnel.tsx';
import { HEATMAP_PROPS } from '#charts/heatmap/heatmap.tsx';
import { AREA_CHART_PROPS, LINE_CHART_PROPS } from '#charts/line/line-chart.tsx';
import { SCATTER_PROPS } from '#charts/scatter/scatter.tsx';
import { SLOPE_PROPS } from '#charts/slope/slope.tsx';
import { SPARKLINE_PROPS } from '#charts/sparkline/sparkline.tsx';
import { WATERFALL_PROPS } from '#charts/waterfall/waterfall.tsx';

/**
 * The props each component declares, by tag: each list is checked against the component's props
 * type at compile time.
 */
const DECLARED: Readonly<Record<string, readonly string[]>> = {
  BarChart: BAR_CHART_PROPS,
  LineChart: LINE_CHART_PROPS,
  AreaChart: AREA_CHART_PROPS,
  Donut: DONUT_PROPS,
  Scatter: SCATTER_PROPS,
  Slope: SLOPE_PROPS,
  Waterfall: WATERFALL_PROPS,
  Funnel: FUNNEL_PROPS,
  Heatmap: HEATMAP_PROPS,
  Sparkline: SPARKLINE_PROPS,
  BigNumber: BIG_NUMBER_PROPS,
  StatRow: STAT_ROW_PROPS,
  Comparison: COMPARISON_PROPS,
  Progress: PROGRESS_PROPS,
  Pictogram: PICTOGRAM_PROPS,
  Table: TABLE_PROPS,
};

describe('the chart catalog', () => {
  it('describes every registered component and nothing else', () => {
    expect(CHART_INFOS.map((info) => info.name).toSorted()).toEqual(
      Object.keys(CHART_COMPONENTS).toSorted(),
    );
  });

  it.each(CHART_INFOS.map((info) => [info.name, info] as const))(
    'lists exactly the props <%s> takes',
    (name, info) => {
      expect(chartPropNames(info).toSorted()).toEqual([...(DECLARED[name] ?? [])].toSorted());
    },
  );

  it('advertises annotations only on charts that draw them, with the types they draw', () => {
    const takes = CHART_INFOS.filter((info) => chartPropNames(info).includes('annotations')).map(
      (info) => info.name,
    );
    expect(takes.toSorted()).toEqual(
      ['AreaChart', 'BarChart', 'LineChart', 'Scatter', 'Slope', 'Waterfall'].toSorted(),
    );
    const scatter = CHART_INFOS.find((info) => info.name === 'Scatter');
    expect(scatter?.props['annotations']?.description).toContain('ranges and brackets throw');
  });

  it('prints the shared props once, the object types and the lint limits', () => {
    const catalog = chartCatalog();
    expect(Object.keys(catalog.shared)).toContain('highlight');
    expect(Object.keys(catalog.types)).toEqual(
      expect.arrayContaining([
        'RowStat',
        'ProgressItem',
        'Highlight',
        'Annotation.callout',
        'Annotation.reference',
        'Annotation.range',
        'Annotation.bracket',
        'RevealOption',
      ]),
    );
    const bar = catalog.charts.find((info) => info.name === 'BarChart');
    expect(bar?.limits['categories']).toBe(CHART_LIMITS.categories.bar);
    expect(catalog.charts.every((info) => info.nulls.length > 0)).toBe(true);
  });

  it('documents both forms of `reveal`, with the values the prop check takes', () => {
    const catalog = chartCatalog();
    const object = catalog.types['RevealOption'];
    expect(Object.keys(object ?? {})).toEqual(['by', 'from']);
    for (const by of REVEAL_BY) {
      expect(object?.['by']?.type).toContain(`"${by}"`);
    }

    const takes = catalog.charts.filter((info) => chartPropNames(info).includes('reveal'));
    expect(takes.map((info) => info.name).toSorted()).toEqual(
      ['AreaChart', 'BarChart', 'Funnel', 'LineChart', 'Waterfall'].toSorted(),
    );
    for (const info of takes) {
      const reveal = info.props['reveal'];
      expect(reveal?.type, info.name).toContain('RevealOption');
      for (const by of REVEAL_BY) {
        expect(reveal?.type, info.name).toContain(`"${by}"`);
      }
    }
  });
});

describe('checkProps', () => {
  it('lets every catalog prop, data attributes and children through', () => {
    expect(() => {
      checkProps('BarChart', { data: [], x: 'a', 'data-deck-source': 'x.mdx:1:1', children: null });
    }).not.toThrow();
  });

  it('names an unknown prop, the prop it most likely means and the props there are', () => {
    expect(() => {
      checkProps('BarChart', { data: [], value: 'n' });
    }).toThrow('`value` is not a prop of BarChart; did you mean `y`?');
    expect(() => {
      checkProps('BarChart', { data: [], title: 'Revenue' });
    }).toThrow('did you mean `caption`?');
    expect(() => {
      checkProps('LineChart', { data: [], highlighted: 'EMEA' });
    }).toThrow('did you mean `highlight`?');
    expect(() => {
      checkProps('Donut', { data: [], annotations: [] });
    }).toThrow('`annotations` is not a prop of Donut');
  });

  it('suggests the nearest name for a typo and nothing for a stranger', () => {
    expect(closestProp('hightlight', ['highlight', 'format'])).toBe('highlight');
    expect(closestProp('units', ['unit', 'format'])).toBe('unit');
    expect(closestProp('zzzzzz', ['unit', 'format'])).toBeUndefined();
  });
});
