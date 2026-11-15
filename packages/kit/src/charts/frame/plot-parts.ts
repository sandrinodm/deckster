import type { ResolvedFormat } from '#charts/format/number-format.ts';
import type { ChartTheme } from '#charts/frame/chart-theme.ts';
import type { LineItem, SceneItem } from '#charts/frame/scene.ts';
import type { Box } from '#charts/layout/label-placement.ts';
import type { Measure } from '#charts/layout/text-measure.ts';
import type { ValueAxis } from '#charts/scale/linear-scale.ts';

import { tickTexts } from '#charts/format/number-format.ts';
import { thinLabels } from '#charts/layout/label-placement.ts';
import { lineHeight } from '#charts/layout/text-measure.ts';
import { maxOf } from '#foundation/lists.ts';

/**
 * The largest value of a color channel, as the two hex digits of `#rrggbb` write it.
 */
const CHANNEL_MAX = 255;

/**
 * The WCAG transfer curve's linear segment: channels up to this value are divided by the divisor
 * rather than run through the power.
 */
const SRGB_LINEAR_LIMIT = 0.039_28;

/**
 * The divisor of the linear segment of the sRGB transfer curve.
 */
const SRGB_LINEAR_DIVISOR = 12.92;

/**
 * The offset the power segment of the sRGB transfer curve adds before it divides.
 */
const SRGB_OFFSET = 0.055;

/**
 * The divisor the power segment of the sRGB transfer curve applies after its offset.
 */
const SRGB_SCALE = 1.055;

/**
 * The exponent of the power segment of the sRGB transfer curve.
 */
const SRGB_GAMMA = 2.4;

/**
 * The weight of the red channel in relative luminance.
 */
const RED_WEIGHT = 0.2126;

/**
 * The weight of the green channel in relative luminance.
 */
const GREEN_WEIGHT = 0.7152;

/**
 * The weight of the blue channel in relative luminance.
 */
const BLUE_WEIGHT = 0.0722;

/**
 * The tick labels of a value axis, formatted with even fraction digits.
 *
 * @param axis - The axis.
 * @param format - The chart's format.
 */
export function tickLabels(axis: ValueAxis, format: ResolvedFormat): string[] {
  return tickTexts(axis.ticks, format);
}

/**
 * The widest tick label of an axis, for the gutter it needs.
 *
 * @param axis - The axis.
 * @param format - The chart's format.
 * @param theme - The chart theme.
 * @param measure - Measures text.
 */
export function tickLabelWidth(
  axis: ValueAxis,
  format: ResolvedFormat,
  theme: ChartTheme,
  measure: Measure,
): number {
  return maxOf(
    tickLabels(axis, format).map((text) => measure(tabularText(text), theme.text.axis)),
    0,
  );
}

/**
 * A label with every digit as wide as a zero, as the tabular figures tick labels are set in.
 *
 * @param text - The label.
 */
function tabularText(text: string): string {
  return text.replaceAll(/\d/gu, '0');
}

/**
 * How far under the plot labels along the x axis start: clear of the lowest y tick label, which is
 * centred on the bottom edge.
 *
 * @param theme - The chart theme.
 */
export function xLabelDrop(theme: ChartTheme): number {
  return lineHeight(theme.text.axis) / 2 + theme.space.xs;
}

/**
 * Gridlines, the baseline and tick labels for a value axis.
 */
export type AxisInput = {
  /**
   * The axis.
   */
  axis: ValueAxis;

  /**
   * The pixel position of a value along the axis.
   */
  at: (value: number) => number;

  /**
   * `y` for a vertical value axis (columns, lines), `x` for a horizontal one (bars).
   */
  direction: 'x' | 'y';

  /**
   * The plot area.
   */
  plot: Box;

  /**
   * The chart theme.
   */
  theme: ChartTheme;

  /**
   * The chart's format.
   */
  format: ResolvedFormat;

  /**
   * Whether to draw gridlines and tick labels (`false` when every value is labeled on its mark).
   */
  ticks: boolean;

  /**
   * The value the baseline sits on: zero, or the axis minimum for a zoomed line.
   */
  baseline: number;

  /**
   * Measures text, so the labels of a horizontal axis are thinned until none touches the next;
   * every label is drawn when left out.
   */
  measure?: Measure;
};

/**
 * The items of a value axis: hairline gridlines in the brand's grid color at each tick, the
 * baseline in the axis color, and the tick labels in the axis label style, right-aligned in the
 * gutter (vertical axis) or centred under the plot (horizontal axis).
 *
 * @param input - The axis, its geometry and the theme.
 */
export function axisItems(input: AxisInput): SceneItem[] {
  const { axis, at, direction, plot, theme, format, ticks, baseline, measure } = input;
  const items: SceneItem[] = [];
  const labels = tickLabels(axis, format);
  const style = theme.text.axis;
  const shown =
    direction === 'x' && measure !== undefined
      ? new Set(
          thinLabels(
            axis.ticks.map((tick) => at(tick)),
            labels.map((text) => measure(tabularText(text), style)),
            theme.space.md,
          ),
        )
      : undefined;
  for (const [index, tick] of axis.ticks.entries()) {
    if (!ticks) {
      break;
    }

    const position = at(tick);
    if (theme.grid.show && tick !== baseline) {
      items.push(gridLine(direction, position, plot, theme));
    }

    if (shown !== undefined && !shown.has(index)) {
      continue;
    }

    items.push(tickText(direction, position, labels[index] ?? '', plot, theme));
  }

  if (theme.axis.show) {
    const position = at(baseline);
    items.push({
      ...gridLine(direction, position, plot, theme),
      stroke: theme.colors.axis,
      width: theme.axis.width,
    });
  }

  return items;
}

/**
 * The label of one tick: right-aligned in the gutter beside a vertical axis, centred under the plot
 * for a horizontal one.
 *
 * @param direction - The value axis direction.
 * @param position - The tick's pixel position along the value axis.
 * @param text - The label.
 * @param plot - The plot area.
 * @param theme - The chart theme.
 */
function tickText(
  direction: 'x' | 'y',
  position: number,
  text: string,
  plot: Box,
  theme: ChartTheme,
): SceneItem {
  const style = theme.text.axis;
  if (direction === 'y') {
    return {
      kind: 'text',
      x: plot.x - theme.space.sm,
      y: position,
      lines: [text],
      style,
      color: theme.colors.label,
      anchor: 'end',
      tabular: true,
    };
  }

  return {
    kind: 'text',
    x: position,
    y: plot.y + plot.height + xLabelDrop(theme) + lineHeight(style) / 2,
    lines: [text],
    style,
    color: theme.colors.label,
    anchor: 'middle',
    tabular: true,
  };
}

/**
 * A gridline across the plot at a position along the value axis.
 *
 * @param direction - The value axis direction.
 * @param position - The pixel position.
 * @param plot - The plot area.
 * @param theme - The chart theme.
 */
function gridLine(direction: 'x' | 'y', position: number, plot: Box, theme: ChartTheme): LineItem {
  const common = {
    kind: 'line' as const,
    stroke: theme.colors.grid,
    width: theme.grid.width,
    ...(theme.grid.dash === undefined ? {} : { dash: theme.grid.dash }),
  };
  return direction === 'y'
    ? { ...common, x1: plot.x, y1: position, x2: plot.x + plot.width, y2: position }
    : { ...common, x1: position, y1: plot.y, x2: position, y2: plot.y + plot.height };
}

/**
 * The color text should take on a filled mark: whichever of the chart's value color and its plate
 * reads better on the fill, so a label inside a dark bar turns light and one in a pale bar dark.
 *
 * @param fill - The mark's fill as `#rrggbb`.
 * @param theme - The chart theme.
 */
export function textOn(fill: string, theme: ChartTheme): string {
  const fillLight = luminance(fill);
  const candidates = [theme.colors.value, theme.plate];
  const scored = candidates.map((color) => ({
    color,
    ratio: contrast(luminance(color), fillLight),
  }));
  return scored.toSorted((a, b) => b.ratio - a.ratio)[0]?.color ?? theme.colors.value;
}

/**
 * The WCAG contrast ratio of two relative luminances.
 *
 * @param a - One luminance.
 * @param b - The other.
 */
export function contrast(a: number, b: number): number {
  const offset = 0.05;
  return (Math.max(a, b) + offset) / (Math.min(a, b) + offset);
}

/**
 * The WCAG relative luminance of a `#rrggbb` color; translucent colors count as opaque.
 *
 * @param hex - The color.
 */
export function luminance(hex: string): number {
  const channels = [1, 3, 5].map(
    (start) => Number.parseInt(hex.slice(start, start + 2), 16) / CHANNEL_MAX,
  );
  const [r = 0, g = 0, b = 0] = channels.map((channel) => linearChannel(channel));
  return RED_WEIGHT * r + GREEN_WEIGHT * g + BLUE_WEIGHT * b;
}

/**
 * One sRGB channel, from its gamma-encoded value to linear light (the WCAG transfer curve).
 *
 * @param channel - The channel, from 0 to 1.
 */
function linearChannel(channel: number): number {
  if (channel <= SRGB_LINEAR_LIMIT) {
    return channel / SRGB_LINEAR_DIVISOR;
  }

  return ((channel + SRGB_OFFSET) / SRGB_SCALE) ** SRGB_GAMMA;
}
