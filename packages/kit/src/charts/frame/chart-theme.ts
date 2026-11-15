import type { BrandView } from '@deckster/brand/runtime';

import type { ChartSpecColors } from '#charts/chart-spec.ts';
import type { NumberDefaults } from '#charts/format/number-format.ts';
import type { TextStyle } from '#charts/layout/text-measure.ts';

/**
 * Everything a chart draws with on one surface: colors as hex, text styles from the brand's chart
 * label steps, number defaults, line widths and the bar corner.
 */
export type ChartTheme = {
  /**
   * The surface name.
   */
  surface: string;

  /**
   * Whether the surface is dark.
   */
  scheme: 'light' | 'dark';

  /**
   * Categorical colors for series and slices, in the brand's order.
   */
  categorical: readonly string[];

  /**
   * Sequential colors for magnitude, light to dark on light surfaces.
   */
  sequential: readonly string[];

  /**
   * The muted color of data that is not highlighted.
   */
  context: string;

  /**
   * The plate charts draw behind themselves.
   */
  plate: string;

  /**
   * Whether the plate differs from the slide background and so shows as a panel.
   */
  plateVisible: boolean;

  /**
   * Chart colors from the brand's `charts` section and the surface's roles.
   */
  colors: {
    /**
     * Gridlines.
     */
    grid: string;

    /**
     * The baseline and axis lines.
     */
    axis: string;

    /**
     * Axis, legend and annotation text.
     */
    label: string;

    /**
     * Value labels and table text.
     */
    value: string;

    /**
     * Big numbers.
     */
    stat: string;

    /**
     * Headings and emphasized text.
     */
    heading: string;

    /**
     * The accent.
     */
    accent: string;

    /**
     * Increases and good news.
     */
    positive: string;

    /**
     * Decreases and bad news.
     */
    negative: string;

    /**
     * The accent for small text, held to 4.5:1 on the plate and the backdrop.
     */
    accentText: string;

    /**
     * Increases and good news in small text, held to 4.5:1.
     */
    positiveText: string;

    /**
     * Decreases and bad news in small text, held to 4.5:1.
     */
    negativeText: string;

    /**
     * Emphasized table rows.
     */
    emphasis: string;

    /**
     * Text on emphasized table rows.
     */
    emphasisFg: string;
  };

  /**
   * Text styles, from the brand's `charts.labels` steps.
   */
  text: {
    /**
     * Axis tick and category labels.
     */
    axis: TextStyle;

    /**
     * Value labels on marks.
     */
    value: TextStyle;

    /**
     * Legend and series labels.
     */
    legend: TextStyle;

    /**
     * Annotation text.
     */
    annotation: TextStyle;

    /**
     * Big numbers inside a chart (a donut's centre), from the brand's stat step.
     */
    stat: TextStyle;

    /**
     * The label under a big number.
     */
    statLabel: TextStyle;

    /**
     * Short headings inside a figure (a pictogram's label), from the title step.
     */
    heading: TextStyle;

    /**
     * Running text inside a figure, from the body step.
     */
    body: TextStyle;
  };

  /**
   * The brand's number defaults.
   */
  numbers: NumberDefaults;

  /**
   * Gridline style.
   */
  grid: { show: boolean; width: number; dash: string | undefined };

  /**
   * Axis line style.
   */
  axis: { show: boolean; width: number };

  /**
   * The corner radius of a bar's data end.
   */
  barRadius: number;

  /**
   * The width of a line series and of connectors.
   */
  lineWidth: number;

  /**
   * The brand's spacing scale, for gaps inside the plot.
   */
  space: { xs: number; sm: number; md: number; lg: number; xl: number };

  /**
   * The table style: how emphasized rows are marked, and the type step of body cells.
   */
  table: { emphasis: 'fill' | 'text' | 'bar'; body: string };
};

/**
 * The dash pattern of each brand line style, as `stroke-dasharray`.
 */
const DASHES: Readonly<Record<string, string | undefined>> = {
  /**
   * A solid line.
   */
  solid: undefined,

  /**
   * Even dashes.
   */
  dashed: '6 6',

  /**
   * Round dots.
   */
  dotted: '1 5',
};

/**
 * Line series are drawn this many times the brand's regular stroke, so they read at slide scale.
 */
const LINE_WIDTH_FACTOR = 1.5;

/**
 * Builds the chart theme for a surface of the deck's brand. The plate shows wherever the chart
 * would otherwise sit on something busier than one color: a gradient, an image or pattern layer, or
 * the slide's own background image.
 *
 * @param view - The brand as seen from the surface, from `getBrand`.
 * @param slideImage - Whether the slide paints its own `background:` image.
 */
export function chartTheme(view: BrandView, slideImage = false): ChartTheme {
  const { brand, surface } = view;
  const busy =
    slideImage ||
    surface.gradient !== undefined ||
    surface.layers.some((layer) => layer.type === 'image' || layer.type === 'pattern');
  const { charts } = brand;
  return {
    surface: surface.name,
    scheme: surface.scheme,
    categorical: surface.data.categorical,
    sequential: surface.data.sequential,
    context: surface.data.context,
    plate: surface.data.plate,
    plateVisible: surface.data.plate.toLowerCase() !== surface.roles.bg.toLowerCase() || busy,
    colors: surfaceColors(surface),
    text: chartTextStyles(brand),
    numbers: charts.numbers,
    grid: { show: charts.grid.show, width: charts.grid.stroke, dash: DASHES[charts.grid.dash] },
    axis: { show: charts.axis.show, width: charts.axis.stroke },
    barRadius: brand.shape.radius.sm,
    lineWidth: brand.shape.stroke.regular * LINE_WIDTH_FACTOR,
    space: {
      xs: brand.spacing.scale.xs,
      sm: brand.spacing.scale.sm,
      md: brand.spacing.scale.md,
      lg: brand.spacing.scale.lg,
      xl: brand.spacing.scale.xl,
    },
    table: { emphasis: charts.table.emphasis, body: charts.table.body },
  };
}

/**
 * The theme's colors as a chart spec lists them.
 *
 * @param theme - The chart theme.
 */
export function specColors(theme: ChartTheme): ChartSpecColors {
  return {
    plate: theme.plate,
    context: theme.context,
    label: theme.colors.label,
    value: theme.colors.value,
    grid: theme.colors.grid,
    axis: theme.colors.axis,
    positive: theme.colors.positive,
    negative: theme.colors.negative,
  };
}

/**
 * The categorical color of the series at a position; past the end of the palette, the context
 * color, since the brand defines no more distinct hues (lint warns about that many series).
 *
 * @param theme - The chart theme.
 * @param index - The series' position.
 */
export function seriesColor(theme: ChartTheme, index: number): string {
  return theme.categorical[index] ?? theme.context;
}

/**
 * The color of each series: the brand's categorical colors in order, except that a single
 * highlighted series among several takes the first color, the brand's lead data color, and the
 * others follow it in order.
 *
 * @param theme - The chart theme.
 * @param keys - The series keys, in data order.
 * @param highlighted - The highlighted series keys.
 * @returns Each key's color.
 */
export function seriesColors(
  theme: ChartTheme,
  keys: readonly string[],
  highlighted: ReadonlySet<string>,
): Map<string, string> {
  const lead = highlighted.size === 1 && keys.length > 1 ? [...highlighted][0] : undefined;
  const ordered = lead === undefined ? keys : [lead, ...keys.filter((key) => key !== lead)];
  return new Map(ordered.map((key, index) => [key, seriesColor(theme, index)]));
}

/**
 * The chart colors of a surface: the brand's `charts` colors and the surface's roles and text
 * colors, as hex.
 *
 * @param surface - The surface as seen from the brand.
 */
function surfaceColors(surface: BrandView['surface']): ChartTheme['colors'] {
  return {
    grid: surface.charts.grid,
    axis: surface.charts.axis,
    label: surface.charts.label,
    value: surface.charts.value,
    stat: surface.charts.stat,
    heading: surface.roles.heading,
    accent: surface.roles.accent,
    positive: surface.roles.positive,
    negative: surface.roles.negative,
    accentText: surface.text.accent,
    positiveText: surface.text.positive,
    negativeText: surface.text.negative,
    emphasis: surface.charts.emphasis,
    emphasisFg: surface.charts['emphasis-fg'],
  };
}

/**
 * The text styles of a chart, each from a brand type step: the `charts.labels` steps, the stat
 * steps and the title and body steps.
 *
 * @param brand - The brand.
 */
function chartTextStyles(brand: BrandView['brand']): ChartTheme['text'] {
  const { charts } = brand;
  /**
   * A text style from a brand type step.
   */
  const style = (step: keyof typeof brand.typography.scale): TextStyle => {
    const tokens = brand.typography.scale[step];
    return {
      step,
      family: brand.typography.families[tokens.family].stack,
      size: tokens.size,
      weight: tokens.weight,
      tracking: tokens.tracking,
      upper: tokens.case === 'upper',
      lineHeight: tokens.lineHeight,
    };
  };
  return {
    axis: style(charts.labels.axis),
    value: style(charts.labels.value),
    legend: style(charts.labels.legend),
    annotation: style(charts.labels.annotation),
    stat: style(charts.stat.step),
    statLabel: style(charts.stat.label),
    heading: style('title'),
    body: style('body'),
  };
}
