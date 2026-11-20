import type { Box } from '#charts/layout/label-placement.ts';
import type { TextStyle } from '#charts/layout/text-measure.ts';

import { maxOf } from '#foundation/lists.ts';

/**
 * How a mark builds in: bars rise from the baseline (or drop, or grow sideways), lines draw, dots
 * pop, labels and the rest fade.
 */
export type Anim = 'rise' | 'drop' | 'grow-right' | 'grow-left' | 'draw' | 'pop' | 'fade';

/**
 * What every drawn item may carry.
 */
type ItemCommon = {
  /**
   * How it builds in; it appears in place when left out.
   */
  anim?: Anim;

  /**
   * Its place in the stagger of its build.
   */
  order?: number;

  /**
   * Whether it waits for the marks before building (labels and annotations).
   */
  lag?: boolean;

  /**
   * Whether it is a data mark, whose color changes when a highlight arrives.
   */
  mark?: boolean;
};

/**
 * A filled or stroked shape, as an SVG path.
 */
export type PathItem = ItemCommon & {
  /**
   * Tells items apart.
   */
  kind: 'path';

  /**
   * The path data.
   */
  d: string;

  /**
   * The fill once the highlight is on (or always, without one); `none` for strokes.
   */
  fill: string;

  /**
   * The fill before a highlight that arrives at a step; `fill` when left out.
   */
  fillBefore?: string;

  /**
   * The stroke, if any.
   */
  stroke?: string;

  /**
   * The stroke before a highlight that arrives at a step.
   */
  strokeBefore?: string;

  /**
   * The stroke width.
   */
  strokeWidth?: number;

  /**
   * A dash pattern.
   */
  dash?: string;

  /**
   * The fill opacity, for washes under lines.
   */
  fillOpacity?: number;

  /**
   * Whether the path is measured as length 1, so it can draw in.
   */
  drawable?: boolean;

  /**
   * The line cap; round unless a ring segment needs square ends.
   */
  cap?: 'round' | 'butt';
};

/**
 * A circle: a point, an end marker.
 */
export type CircleItem = ItemCommon & {
  /**
   * Tells items apart.
   */
  kind: 'circle';

  /**
   * The centre's x.
   */
  cx: number;

  /**
   * The centre's y.
   */
  cy: number;

  /**
   * The radius.
   */
  r: number;

  /**
   * The fill once the highlight is on.
   */
  fill: string;

  /**
   * The fill before a highlight that arrives at a step.
   */
  fillBefore?: string;

  /**
   * The ring around it, in the plate color, so it reads where it crosses a line.
   */
  ring?: string;

  /**
   * The ring's width.
   */
  ringWidth?: number;
};

/**
 * A straight line: a gridline, a reference line, a leader.
 */
export type LineItem = ItemCommon & {
  /**
   * Tells items apart.
   */
  kind: 'line';

  /**
   * The start's x.
   */
  x1: number;

  /**
   * The start's y.
   */
  y1: number;

  /**
   * The end's x.
   */
  x2: number;

  /**
   * The end's y.
   */
  y2: number;

  /**
   * The color.
   */
  stroke: string;

  /**
   * The width.
   */
  width: number;

  /**
   * A dash pattern.
   */
  dash?: string;
};

/**
 * Text: one line or several, centred on `y` (the first line's centre).
 */
export type TextItem = ItemCommon & {
  /**
   * Tells items apart.
   */
  kind: 'text';

  /**
   * The anchor's x.
   */
  x: number;

  /**
   * The first line's vertical centre.
   */
  y: number;

  /**
   * The lines.
   */
  lines: readonly string[];

  /**
   * The style, from the brand's chart label steps.
   */
  style: TextStyle;

  /**
   * The color once the highlight is on.
   */
  color: string;

  /**
   * The color before a highlight that arrives at a step.
   */
  colorBefore?: string;

  /**
   * Which end of the text sits on `x`.
   */
  anchor: 'start' | 'middle' | 'end';

  /**
   * A heavier weight, for highlighted values and totals.
   */
  weight?: number;

  /**
   * Whether the text is a number in a column, set with tabular figures.
   */
  tabular?: boolean;

  /**
   * The fill of the mark the text sits on (a label inside a bar or cell), as `#rrggbb`. SVG does
   * not paint it; it tells `deck lint`'s contrast check what the text is read against.
   */
  background?: string;

  /**
   * The mark color behind the label before its highlight comes in.
   */
  backgroundBefore?: string;

  /**
   * The whole text, when the lines had to cut it short to fit. Written as `data-truncated`, which
   * `deck lint` reports (`text-truncated`): a chart never cuts a label silently.
   */
  cut?: string;
};

/**
 * Anything a chart draws.
 */
export type SceneItem = PathItem | CircleItem | LineItem | TextItem;

/**
 * Items revealed together at a step.
 */
export type SceneLayer = {
  /**
   * The step that reveals the layer; shown from the start when left out.
   */
  at: number | undefined;

  /**
   * The step that removes this layer from the plot, if its content is replaced by a later layer.
   */
  until?: number;

  /**
   * The items, drawn in order.
   */
  items: SceneItem[];
};

/**
 * A chart's plot, ready to draw: its size, its layers in drawing order, and the step at which its
 * highlight turns on.
 */
export type Scene = {
  /**
   * The plot's width.
   */
  width: number;

  /**
   * The plot's height.
   */
  height: number;

  /**
   * The layers, back to front.
   */
  layers: SceneLayer[];

  /**
   * The step that turns the highlight on, if it waits for one.
   */
  highlightAt: number | undefined;
};

/**
 * The text items of a scene with their boxes, for tests and collision checks: each line's box from
 * the measured width and the style's line height.
 *
 * @param scene - The scene.
 * @param measure - Measures text width.
 */
export function textBoxes(
  scene: Scene,
  measure: (text: string, style: TextStyle) => number,
): { item: TextItem; box: Box }[] {
  return scene.layers.flatMap((layer) =>
    layer.items.flatMap((item) => {
      if (item.kind !== 'text') {
        return [];
      }

      const width = maxOf(item.lines.map((line) => measure(line, item.style)));
      const height = item.style.size * item.style.lineHeight;
      const left = anchorLeft(item.x, width, item.anchor);
      const box = { x: left, y: item.y - height / 2, width, height: height * item.lines.length };
      return [{ item, box }];
    }),
  );
}

/**
 * The left edge of a text of a width anchored at `x`.
 *
 * @param x - The anchor.
 * @param width - The text's width.
 * @param anchor - Which end of the text sits on `x`.
 */
export function anchorLeft(x: number, width: number, anchor: TextItem['anchor']): number {
  switch (anchor) {
    case 'start': {
      return x;
    }

    case 'middle': {
      return x - width / 2;
    }

    case 'end': {
      return x - width;
    }
  }
}

/**
 * A rectangle with rounded corners at one end, square at the other: a bar, rounded at its data end
 * and square at the baseline. The radius never exceeds half the bar's thickness or its length.
 *
 * @param box - The bar's box.
 * @param end - The side of the data end.
 * @param radius - The corner radius.
 */
export function barPath(
  box: Box,
  end: 'top' | 'bottom' | 'left' | 'right',
  radius: number,
): string {
  const { x, y, width, height } = box;
  const along = end === 'top' || end === 'bottom' ? height : width;
  const across = end === 'top' || end === 'bottom' ? width : height;
  const r = Math.max(0, Math.min(radius, across / 2, along));
  const right = x + width;
  const bottom = y + height;
  /**
   * A corner arc to a point.
   */
  const arc = (toX: number, toY: number): string => `A${r},${r} 0 0 1 ${toX},${toY}`;
  switch (end) {
    case 'top': {
      return [
        `M${x},${bottom}`,
        `V${y + r}`,
        arc(x + r, y),
        `H${right - r}`,
        arc(right, y + r),
        `V${bottom}Z`,
      ].join('');
    }

    case 'bottom': {
      return [
        `M${right},${y}`,
        `V${bottom - r}`,
        arc(right - r, bottom),
        `H${x + r}`,
        arc(x, bottom - r),
        `V${y}Z`,
      ].join('');
    }

    case 'right': {
      return [
        `M${x},${y}`,
        `H${right - r}`,
        arc(right, y + r),
        `V${bottom - r}`,
        arc(right - r, bottom),
        `H${x}Z`,
      ].join('');
    }

    case 'left': {
      return [
        `M${right},${bottom}`,
        `H${x + r}`,
        arc(x, bottom - r),
        `V${y + r}`,
        arc(x + r, y),
        `H${right}Z`,
      ].join('');
    }
  }
}

/**
 * A polyline through points, skipping gaps: a new subpath starts after each missing point.
 *
 * @param points - The points; `null` for a gap.
 */
export function linePath(points: readonly ({ x: number; y: number } | null)[]): string {
  let path = '';
  let drawing = false;
  for (const point of points) {
    if (point === null) {
      drawing = false;
      continue;
    }

    path += `${drawing ? 'L' : 'M'}${round(point.x)},${round(point.y)}`;
    drawing = true;
  }

  return path;
}

/**
 * The number of hundredths in a unit: path data keeps two decimal places.
 */
const HUNDREDTHS = 100;

/**
 * A number rounded to hundredths, to keep path data short.
 *
 * @param value - The number.
 */
export function round(value: number): number {
  return Math.round(value * HUNDREDTHS) / HUNDREDTHS;
}
