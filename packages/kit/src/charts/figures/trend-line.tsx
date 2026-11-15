import type { ReactNode } from 'react';

import type { ChartTheme } from '#charts/frame/chart-theme.ts';

import { SceneElement } from '#charts/frame/scene-svg.tsx';
import { sparkItems } from '#charts/sparkline/sparkline.tsx';

/**
 * A trend line's width in canvas pixels, when the figure sets none.
 */
const TREND_WIDTH = 240;

/**
 * A trend line's height in canvas pixels, when the figure sets none.
 */
const TREND_HEIGHT = 64;

/**
 * Props of {@link TrendLine}.
 */
type TrendLineProps = {
  /**
   * The values, oldest first.
   */
  values: readonly number[];

  /**
   * The chart theme.
   */
  theme: ChartTheme;

  /**
   * The width in canvas pixels.
   */
  width?: number;

  /**
   * The height in canvas pixels.
   */
  height?: number;
};

/**
 * A sparkline set beside a figure's label: the trend in the context color, the latest value marked
 * in the lead data color. It is decoration for the number beside it, which states the value.
 */
export function TrendLine({
  values,
  theme,
  width = TREND_WIDTH,
  height = TREND_HEIGHT,
}: TrendLineProps): ReactNode {
  const items = sparkItems(values, { width, height, theme, marked: values.length - 1 });
  return (
    <svg
      className="kit-trend"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
      data-decorative="">
      {items.map((item, index) => (
        <SceneElement key={index} item={item} highlightOn />
      ))}
    </svg>
  );
}
