import type { ChartSpec } from '@deckster/kit/chart-spec';

import type { ChartNode, SlideScene, SvgNode } from '#scene/scene.ts';

/**
 * The slide box the fixture plot SVG sits in.
 */
export const PLOT_RECT = { x: 100, y: 200, width: 600, height: 300 } as const;

/**
 * A chart description in the kit's version 1 shape, with overrides.
 *
 * @param overrides - Fields that differ from a three-bar column chart.
 */
export function chartSpec(overrides: Partial<ChartSpec> = {}): ChartSpec {
  return {
    version: 1,
    kind: 'bar',
    native: 'bar',
    orientation: 'vertical',
    stacked: false,
    name: 'Tickets by reason',
    summary: '3 reasons. Billing is highest at 30%.',
    caption: null,
    source: null,
    categories: ['Access', 'Export', 'Billing'],
    series: [
      {
        name: 'share',
        values: [10, 20, 30],
        x: null,
        color: '#61666f',
        pointColors: ['#61666f', '#61666f', '#2f4de4'],
        highlighted: true,
        labels: ['10%', '20%', '30%'],
      },
    ],
    format: {
      locale: 'en-US',
      style: 'number',
      notation: 'standard',
      currency: 'USD',
      maximumFractionDigits: 1,
      suffix: '%',
      excel: '#,##0.0"%"',
    },
    axis: { min: 0, max: 30, ticks: [0, 10, 20, 30], zeroBased: true, truncated: false },
    highlight: { series: [], categories: ['Billing'], points: [], range: null },
    annotations: [],
    legend: false,
    figures: [],
    table: null,
    colors: {
      plate: '#0c0e13',
      context: '#61666f',
      label: '#9aa1ae',
      value: '#f4f5f8',
      grid: '#272b34',
      axis: '#9aa1ae',
      positive: '#5eead4',
      negative: '#ff7d6b',
    },
    ...overrides,
  };
}

/**
 * The SVG a kit column chart draws for {@link chartSpec}: a baseline, three bars with rounded tops
 * on a 5-pixels-per-unit scale, a value label above each bar and a category label under it.
 */
export function barMarkup(): string {
  const bars = [
    { center: 100, value: 10, fill: 'rgb(97, 102, 111)', label: '10%' },
    { center: 300, value: 20, fill: 'rgb(97, 102, 111)', label: '20%' },
    { center: 500, value: 30, fill: 'rgb(47, 77, 228)', label: '30%' },
  ];
  const categories = ['Access', 'Export', 'Billing'];
  const parts = bars.map((bar) => {
    const top = 250 - bar.value * 5;
    return `<path class="kit-chart-mark" d="M${bar.center - 40},250V${top + 6}A6,6 0 0 1 ${bar.center - 34},${top}H${bar.center + 34}A6,6 0 0 1 ${bar.center + 40},${top + 6}V250Z" style="fill: ${bar.fill};"></path>`;
  });
  const labels = bars.map(
    (bar) =>
      `<text class="kit-chart-text kit-type-small" x="${bar.center}" y="${250 - bar.value * 5 - 20}" text-anchor="middle" style="fill: rgb(244, 245, 248); font-size: 26px; font-family: Inter, sans-serif; font-weight: 400;">${bar.label}</text>`,
  );
  const names = categories.map(
    (category, index) =>
      `<text class="kit-chart-text kit-type-caption" x="${100 + index * 200}" y="275" text-anchor="middle" style="fill: rgb(154, 161, 174); font-size: 24px; font-family: Inter, sans-serif; font-weight: ${index === 2 ? 650 : 400};">${category}</text>`,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300" viewBox="0 0 600 300"><g><line x1="0" y1="250" x2="600" y2="250" stroke="#9aa1ae" stroke-width="1"></line>${names.join('')}</g><g>${parts.join('')}${labels.join('')}</g></svg>`;
}

/**
 * A scene with one chart and its plot SVG.
 *
 * @param spec - The chart's description.
 * @param markup - The plot's SVG.
 * @returns The chart node and the scene.
 */
export function chartScene(
  spec: ChartSpec,
  markup: string,
): { node: ChartNode; scene: Pick<SlideScene, 'nodes' | 'tree'> } {
  const common = {
    selector: 'figure.kit-chart',
    order: 0,
    opacity: 1,
    hints: [],
    slot: null,
    step: null,
    replacedAt: null,
  };
  const node: ChartNode = {
    ...common,
    id: 1,
    parent: null,
    rect: { x: 80, y: 160, width: 640, height: 360 },
    kind: 'chart',
    chart: spec,
  };
  const plot: SvgNode = {
    ...common,
    id: 2,
    parent: 1,
    rect: { ...PLOT_RECT },
    kind: 'svg',
    markup,
    shapes: null,
    href: null,
  };
  return { node, scene: { nodes: [node, plot], tree: { '1': null, '2': 1 } } };
}
