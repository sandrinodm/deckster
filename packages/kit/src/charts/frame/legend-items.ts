import type { ChartTheme } from '#charts/frame/chart-theme.ts';
import type { SceneItem } from '#charts/frame/scene.ts';
import type { Measure } from '#charts/layout/text-measure.ts';

import { lineHeight } from '#charts/layout/text-measure.ts';

/**
 * One entry of a legend.
 */
export type LegendEntry = {
  /**
   * The series name.
   */
  label: string;

  /**
   * The series color.
   */
  color: string;

  /**
   * The step its series appears at, if any.
   */
  at: number | undefined;
};

/**
 * The swatch's size as a share of the legend type size.
 */
const SWATCH_SCALE = 0.62;

/**
 * The room a legend takes above the plot.
 *
 * @param theme - The chart theme.
 */
export function legendHeight(theme: ChartTheme): number {
  return lineHeight(theme.text.legend) + theme.space.md;
}

/**
 * A legend in one row along the top of the plot: a rounded swatch in each series' color and its
 * name in the legend style and label color (text never wears the data color).
 *
 * @param entries - The entries, in series order.
 * @param context - The theme, the measurer and the plot width.
 */
export function legendItems(
  entries: readonly LegendEntry[],
  context: { theme: ChartTheme; measure: Measure; width: number },
): SceneItem[] {
  const { theme, measure } = context;
  const style = theme.text.legend;
  const swatch = style.size * SWATCH_SCALE;
  const y = lineHeight(style) / 2;
  const items: SceneItem[] = [];
  let x = 0;
  for (const entry of entries) {
    // The corner is at most a quarter of the swatch, so each side keeps a straight run.
    const radius = Math.min(theme.barRadius, swatch / 4);
    items.push(
      {
        kind: 'path',
        d: swatchPath(x, y, swatch, radius),
        fill: entry.color,
        anim: 'fade',
      },
      {
        kind: 'text',
        x: x + swatch + theme.space.xs,
        y,
        lines: [entry.label],
        style,
        color: theme.colors.label,
        anchor: 'start',
        anim: 'fade',
      },
    );
    x += swatch + theme.space.xs + measure(entry.label, style) + theme.space.lg;
  }

  return items;
}

/**
 * The outline of a rounded square swatch, traced clockwise from the top edge.
 *
 * @param x - The swatch's left edge.
 * @param y - The swatch's centre line.
 * @param size - The swatch's side.
 * @param radius - The corner radius.
 */
function swatchPath(x: number, y: number, size: number, radius: number): string {
  const run = size - 2 * radius;
  return [
    `M${x + radius},${y - size / 2}`,
    `h${run}`,
    `a${radius},${radius} 0 0 1 ${radius},${radius}`,
    `v${run}`,
    `a${radius},${radius} 0 0 1 ${-radius},${radius}`,
    `h${-run}`,
    `a${radius},${radius} 0 0 1 ${-radius},${-radius}`,
    `v${-run}`,
    `a${radius},${radius} 0 0 1 ${radius},${-radius}`,
    'Z',
  ].join('');
}
