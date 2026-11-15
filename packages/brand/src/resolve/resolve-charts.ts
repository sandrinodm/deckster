import type { ChartTokens, Hex, ShapeTokens } from '#resolve/brand-tokens.ts';
import type { SurfaceColors } from '#resolve/surface-colors.ts';
import type { BrandCharts, ChartColor } from '#schema/charts-schema.ts';

import { GRAPHIC_CONTRAST, TEXT_CONTRAST } from '#checks/contrast-thresholds.ts';
import { compositeOver, formatHex, fromHex, mixColors, type Rgba } from '#color/color.ts';
import { ensureContrast, ensureContrastOnAll } from '#color/contrast.ts';

/**
 * What a brand's charts look like when its `charts` section leaves a field out: hairline gridlines
 * in the border color, a hairline axis in the muted color without ticks, caption-sized labels,
 * compact US-English numbers, stats in the stat step and heading color, and tables with label
 * headers, small body text, accent-tinted emphasis rows and hairline rules.
 */
const CHART_DEFAULTS = {
  /**
   * Quiet gridlines that stay behind the data.
   */
  grid: { show: true, color: 'border', stroke: 'hairline', dash: 'solid' },

  /**
   * A baseline, no ticks: direct labels carry the values.
   */
  axis: { show: true, color: 'muted', stroke: 'hairline', dash: 'solid', ticks: false },

  /**
   * Caption-sized labels and legends, small value labels, in the muted color.
   */
  labels: {
    axis: 'caption',
    value: 'small',
    legend: 'caption',
    annotation: 'caption',
    color: 'muted',
  },

  /**
   * 1.2M rather than 1,200,000, one decimal, deltas always signed.
   */
  numbers: {
    locale: 'en-US',
    notation: 'compact',
    currency: 'USD',
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
  },

  /**
   * The stat step in the heading color, with a caption under it.
   */
  stat: { step: 'stat', label: 'caption', color: 'heading' },

  /**
   * Label-style headers over small body text, emphasized rows tinted with the accent.
   */
  table: { header: 'label', body: 'small', emphasis: 'fill', rule: 'hairline', zebra: false },
} as const;

/**
 * How far an emphasized table row's fill moves from the plate toward the accent.
 */
const EMPHASIS_FILL_MIX = 0.16;

/**
 * How far an alternate table row moves from the plate toward the text color.
 */
const ZEBRA_MIX = 0.04;

/**
 * Fills in the brand's `charts` section from {@link CHART_DEFAULTS} and turns stroke names into
 * canvas pixels.
 *
 * @param charts - The section as the brand writes it, or `undefined` when it leaves it out.
 * @param shape - The brand's resolved shape, for stroke widths.
 */
export function resolveCharts(charts: BrandCharts | undefined, shape: ShapeTokens): ChartTokens {
  const grid = { ...CHART_DEFAULTS.grid, ...charts?.grid };
  const axis = { ...CHART_DEFAULTS.axis, ...charts?.axis };
  const table = { ...CHART_DEFAULTS.table, ...charts?.table };
  return {
    grid: { ...grid, stroke: shape.stroke[grid.stroke] },
    axis: { ...axis, stroke: shape.stroke[axis.stroke] },
    labels: { ...CHART_DEFAULTS.labels, ...charts?.labels },
    numbers: { ...CHART_DEFAULTS.numbers, ...charts?.numbers },
    stat: { ...CHART_DEFAULTS.stat, ...charts?.stat },
    table: { ...table, rule: shape.stroke[table.rule] },
  };
}

/**
 * The chart colors on one surface, from the roles the charts section names. Text and marks are
 * moved in lightness until they read on the plate: labels and values (and emphasis text) 4.5:1,
 * axes 3:1, stats 3:1 on every backdrop color since they are large text on the slide itself.
 * Gridlines keep their role's color; they are meant to be faint.
 *
 * @param charts - The brand's resolved chart styles.
 * @param surface - The surface's roles and backdrop.
 * @param plate - The surface's opaque chart plate.
 */
export function surfaceChartColors(
  charts: ChartTokens,
  surface: SurfaceColors,
  plate: Hex,
): Record<ChartColor, Hex> {
  const { roles } = surface;
  const base = fromHex(plate);
  const zebra = mixColors(base, fromHex(roles.fg), ZEBRA_MIX);
  const rows = charts.table.zebra ? [base, zebra] : [base];
  const value = ensureContrastOnAll(fromHex(roles.fg), rows, TEXT_CONTRAST);
  const emphasis = emphasisColors(charts, fromHex(roles.accent), base, value);
  const axis = ensureContrast(fromHex(roles[charts.axis.color]), base, GRAPHIC_CONTRAST);
  const label = ensureContrast(fromHex(roles[charts.labels.color]), base, TEXT_CONTRAST);
  const stat = ensureContrastOnAll(
    fromHex(roles[charts.stat.color]),
    surface.backdrop.map(fromHex),
    GRAPHIC_CONTRAST,
  );
  return {
    grid: roles[charts.grid.color],
    axis: formatHex(axis),
    label: formatHex(label),
    value: formatHex(value),
    stat: formatHex(stat),
    emphasis: formatHex(emphasis.color),
    'emphasis-fg': formatHex(emphasis.text),
    zebra: formatHex(zebra),
  };
}

/**
 * The color that marks an emphasized table row and the text on it: an accent-tinted fill with
 * readable text, accent text, or an accent bar beside plain text.
 *
 * @param charts - The brand's chart styles.
 * @param accent - The surface's accent.
 * @param plate - The opaque plate.
 * @param value - The surface's table text color.
 */
function emphasisColors(
  charts: ChartTokens,
  accent: Rgba,
  plate: Rgba,
  value: Rgba,
): { color: Rgba; text: Rgba } {
  const solid = compositeOver(accent, plate);
  switch (charts.table.emphasis) {
    case 'fill': {
      const fill = mixColors(plate, solid, EMPHASIS_FILL_MIX);
      return { color: fill, text: ensureContrast(value, fill, TEXT_CONTRAST) };
    }

    case 'text': {
      const text = ensureContrast(solid, plate, TEXT_CONTRAST);
      return { color: text, text };
    }

    case 'bar': {
      return { color: ensureContrast(solid, plate, GRAPHIC_CONTRAST), text: value };
    }
  }
}
