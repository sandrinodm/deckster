import type { ChartTheme } from '#charts/frame/chart-theme.ts';
import type { SceneItem, SceneLayer } from '#charts/frame/scene.ts';
import type { ResolvedAnnotation } from '#charts/insight/annotations.ts';
import type { Box, Placement } from '#charts/layout/label-placement.ts';
import type { Measure } from '#charts/layout/text-measure.ts';

import { placeLabels } from '#charts/layout/label-placement.ts';
import { EMPHASIS_WEIGHT, lineHeight, wrapLines } from '#charts/layout/text-measure.ts';
import { maxOf } from '#foundation/lists.ts';

/**
 * A point on the plot, in canvas pixels.
 */
type Point = {
  /**
   * The horizontal position.
   */
  x: number;

  /**
   * The vertical position.
   */
  y: number;
};

/**
 * Where categories and values sit on a cartesian plot, for drawing annotations on it.
 */
export type CartesianGeometry = {
  /**
   * `vertical`: categories along x and values along y (columns, lines); `horizontal`: categories
   * down y and values along x (bars).
   */
  orientation: 'vertical' | 'horizontal';

  /**
   * The plot area.
   */
  plot: Box;

  /**
   * The start and end of a category's place along the category axis.
   */
  span: (index: number) => readonly [number, number];

  /**
   * The position of a value along the value axis.
   */
  value: (value: number) => number;

  /**
   * The tip of a series' mark at a category (a bar's end, a line's point), or `null` without one.
   */
  tip: (series: string, index: number) => Point | null;

  /**
   * How a bracket is drawn: over two bars, or beside a line's later point.
   */
  bracket: 'over' | 'side';
};

/**
 * An annotation's items, split into what goes behind the marks (shaded ranges) and in front.
 */
export type AnnotationLayers = {
  /**
   * Layers drawn before the marks.
   */
  back: SceneLayer[];

  /**
   * Layers drawn after the marks.
   */
  front: SceneLayer[];
};

/**
 * A bracket annotation as the resolver hands it over.
 */
type BracketAnnotation = Extract<ResolvedAnnotation, { type: 'bracket' }>;

/**
 * A bracket's label: its text style and color, and the box its one line takes.
 */
type BracketLabel = {
  /**
   * The text style the label is set in.
   */
  style: ChartTheme['text']['value'];

  /**
   * The label's width in canvas pixels.
   */
  width: number;

  /**
   * The label's height in canvas pixels, one line.
   */
  height: number;

  /**
   * The color the change is written in.
   */
  color: string;
};

/**
 * The ends of a bracket and its label, once the geometry has placed them.
 */
type BracketParts = {
  /**
   * The bracket's start.
   */
  from: Point;

  /**
   * The bracket's end.
   */
  to: Point;

  /**
   * The label the bracket carries.
   */
  label: BracketLabel;
};

/**
 * The widest an annotation label runs before it wraps, in ems of its type.
 */
const LABEL_MEASURE_EM = 14;

/**
 * The narrowest a range's label wraps to, in ems of its type, so a short range still takes a
 * readable label.
 */
const RANGE_LABEL_MIN_EM = 6;

/**
 * The fill opacity of a shaded range over the plot.
 */
const RANGE_FILL_OPACITY = 0.5;

/**
 * The dash pattern of a reference line, in canvas pixels.
 */
const REFERENCE_DASH = '8 6';

/**
 * The band a reference line keeps clear for its label, in line widths of the theme.
 */
const REFERENCE_BAND_LINE_WIDTHS = 4;

/**
 * The radius of a callout's dot, in line widths of the theme.
 */
const CALLOUT_DOT_LINE_WIDTHS = 2.5;

/**
 * The dash pattern of the guide a side bracket runs from its earlier point, in canvas pixels.
 */
const BRACKET_GUIDE_DASH = '2 6';

/**
 * The thickness of a bracket's bar, in canvas pixels.
 */
const BRACKET_BAR_HEIGHT = 2;

/**
 * Callout placements, best first: beside and above the point, away from the data under it.
 */
const CALLOUT_PLACEMENTS: readonly Placement[] = [
  'above-left',
  'above-right',
  'above',
  'left',
  'right',
  'below-left',
  'below-right',
];

/**
 * How many gaps out a callout's label may move, its leader growing with it, when nothing beside its
 * point is free.
 */
const CALLOUT_REACHES = [1, 2, 3.5, 5];

/**
 * Draws a chart's annotations on a cartesian plot, each in a layer of its own step: shaded ranges
 * behind the marks with their label at the top; reference lines across the plot, dashed, with the
 * label at the end; callouts with a leader from a ringed point to a label placed clear of the
 * chart's text; brackets with the change between two points. Labels avoid `obstacles` (value
 * labels, tick labels) and each other.
 *
 * @param annotations - The resolved annotations.
 * @param geometry - Where things sit on the plot.
 * @param context - The theme, the measurer, and the boxes labels must avoid.
 */
export function annotationLayers(
  annotations: readonly ResolvedAnnotation[],
  geometry: CartesianGeometry,
  context: { theme: ChartTheme; measure: Measure; obstacles: readonly Box[] },
): AnnotationLayers {
  const taken: Box[] = [...context.obstacles];
  const back: SceneLayer[] = [];
  const front: SceneLayer[] = [];
  // Ranges and reference lines go first, then brackets, so callouts are placed clear of them all.
  const ordered = [
    ...annotations.filter((note) => note.type === 'range' || note.type === 'reference'),
    ...annotations.filter((note) => note.type === 'bracket'),
    ...annotations.filter((note) => note.type === 'callout'),
  ];
  for (const annotation of ordered) {
    switch (annotation.type) {
      case 'range': {
        back.push({ at: annotation.at, items: rangeItems(annotation, geometry, context, taken) });
        break;
      }

      case 'reference': {
        front.push({
          at: annotation.at,
          items: referenceItems(annotation, geometry, context, taken),
        });
        break;
      }

      case 'callout': {
        front.push({
          at: annotation.at,
          items: calloutItems(annotation, geometry, context, taken),
        });
        break;
      }

      case 'bracket': {
        front.push({
          at: annotation.at,
          items: bracketItems(annotation, geometry, context, taken),
        });
        break;
      }
    }
  }

  return { back, front };
}

/**
 * The context every annotation is drawn with.
 */
type DrawContext = {
  /**
   * The chart theme.
   */
  theme: ChartTheme;

  /**
   * Measures text.
   */
  measure: Measure;
};

/**
 * A shaded span of categories with its label at the top.
 *
 * @param annotation - The range.
 * @param geometry - The plot geometry.
 * @param context - Theme and measurer.
 * @param taken - Boxes labels must avoid; the label's box is added.
 */
function rangeItems(
  annotation: Extract<ResolvedAnnotation, { type: 'range' }>,
  geometry: CartesianGeometry,
  context: DrawContext,
  taken: Box[],
): SceneItem[] {
  const { theme, measure } = context;
  const { plot } = geometry;
  const start = geometry.span(annotation.from)[0];
  const end = geometry.span(annotation.to)[1];
  const vertical = geometry.orientation === 'vertical';
  const box = vertical
    ? { x: start, y: plot.y, width: end - start, height: plot.height }
    : { x: plot.x, y: start, width: plot.width, height: end - start };
  const items: SceneItem[] = [
    {
      kind: 'path',
      d: `M${box.x},${box.y}h${box.width}v${box.height}h${-box.width}Z`,
      fill: theme.colors.grid,
      fillOpacity: RANGE_FILL_OPACITY,
      anim: 'fade',
    },
  ];
  if (annotation.label === '') {
    return items;
  }

  const style = theme.text.annotation;
  const { lines, cut } = wrapLines(
    annotation.label,
    Math.max(box.width - theme.space.sm * 2, style.size * RANGE_LABEL_MIN_EM),
    {
      measure,
      style,
      maxLines: 2,
    },
  );
  const x = vertical ? box.x + theme.space.sm : box.x + box.width - theme.space.sm;
  const y = box.y + theme.space.sm + lineHeight(style) / 2;
  items.push({
    kind: 'text',
    x,
    y,
    lines,
    ...(cut ? { cut: annotation.label } : {}),
    style,
    color: theme.colors.label,
    anchor: vertical ? 'start' : 'end',
    anim: 'fade',
    lag: true,
  });
  const width = maxOf(lines.map((line) => measure(line, style)));
  taken.push({
    x: vertical ? x : x - width,
    y: box.y,
    width,
    height: lineHeight(style) * lines.length + theme.space.sm,
  });
  return items;
}

/**
 * A dashed line across the plot at a value, its label at the far end, above the line where that is
 * free and below it otherwise.
 *
 * @param annotation - The reference line.
 * @param geometry - The plot geometry.
 * @param context - Theme and measurer.
 * @param taken - Boxes labels must avoid; the label's box is added.
 */
function referenceItems(
  annotation: Extract<ResolvedAnnotation, { type: 'reference' }>,
  geometry: CartesianGeometry,
  context: DrawContext,
  taken: Box[],
): SceneItem[] {
  const { theme, measure } = context;
  const { plot } = geometry;
  const position = geometry.value(annotation.value);
  const style = theme.text.annotation;
  const width = measure(annotation.label, style);
  const height = lineHeight(style);
  const vertical = geometry.orientation === 'vertical';
  const line = referenceLine(geometry, position, theme);
  const anchor = vertical ? { x: plot.x + plot.width, y: position } : { x: position, y: plot.y };
  const placements: readonly Placement[] = vertical
    ? ['above-left', 'below-left']
    : ['right', 'left'];
  const [placed] = placeLabels(
    [{ anchor, width, height, placements }],
    taken,
    {
      x: plot.x - theme.space.md,
      y: 0,
      width: plot.width + theme.space.md * 2,
      height: plot.y + plot.height + height,
    },
    theme.space.xs,
  );
  const box = placed?.box ?? { x: anchor.x - width, y: anchor.y - height, width, height };
  // The band the line keeps clear, so no other label is placed across it.
  const band = REFERENCE_BAND_LINE_WIDTHS * theme.lineWidth;
  taken.push(
    box,
    vertical
      ? { x: plot.x, y: position - band / 2, width: plot.width, height: band }
      : { x: position - band / 2, y: plot.y, width: band, height: plot.height },
  );
  return [
    line,
    {
      kind: 'text',
      x: box.x,
      y: box.y + height / 2,
      lines: [annotation.label],
      style,
      color: theme.colors.value,
      anchor: 'start',
      weight: EMPHASIS_WEIGHT,
      anim: 'fade',
      lag: true,
    },
  ];
}

/**
 * The dashed line a reference draws across the plot at its value.
 *
 * @param geometry - The plot geometry.
 * @param position - The value's position along the value axis.
 * @param theme - The chart theme.
 */
function referenceLine(
  geometry: CartesianGeometry,
  position: number,
  theme: ChartTheme,
): SceneItem {
  const { plot } = geometry;
  if (geometry.orientation === 'vertical') {
    return {
      kind: 'line',
      x1: plot.x,
      y1: position,
      x2: plot.x + plot.width,
      y2: position,
      stroke: theme.colors.axis,
      width: theme.lineWidth,
      dash: REFERENCE_DASH,
      anim: 'fade',
    };
  }

  return {
    kind: 'line',
    x1: position,
    y1: plot.y,
    x2: position,
    y2: plot.y + plot.height,
    stroke: theme.colors.axis,
    width: theme.lineWidth,
    dash: REFERENCE_DASH,
    anim: 'fade',
  };
}

/**
 * A ringed dot on a point, a leader and a label placed where it covers nothing.
 *
 * @param annotation - The callout.
 * @param geometry - The plot geometry.
 * @param context - Theme and measurer.
 * @param taken - Boxes labels must avoid; the label's box is added.
 */
function calloutItems(
  annotation: Extract<ResolvedAnnotation, { type: 'callout' }>,
  geometry: CartesianGeometry,
  context: DrawContext,
  taken: Box[],
): SceneItem[] {
  const { theme, measure } = context;
  const point = pointOf(annotation, geometry);
  const style = theme.text.annotation;
  const { lines, cut } = wrapLines(annotation.label, style.size * LABEL_MEASURE_EM, {
    measure,
    style,
    maxLines: 3,
  });
  const width = maxOf(lines.map((line) => measure(line, style)));
  const height = lineHeight(style) * lines.length;
  const gap = theme.space.lg;
  const [placed] = placeLabels(
    [{ anchor: point, width, height, placements: CALLOUT_PLACEMENTS }],
    taken,
    {
      x: 0,
      y: 0,
      width: geometry.plot.x + geometry.plot.width,
      height: geometry.plot.y + geometry.plot.height,
    },
    gap,
    CALLOUT_REACHES,
  );
  const box = placed?.box ?? { x: point.x, y: point.y - gap - height, width, height };
  taken.push(box);
  const end = nearestEdge(box, point);
  const right = box.x >= point.x;
  return [
    {
      kind: 'line',
      x1: point.x,
      y1: point.y,
      x2: end.x,
      y2: end.y,
      stroke: theme.colors.axis,
      width: theme.axis.width,
      anim: 'fade',
      lag: true,
    },
    {
      kind: 'circle',
      cx: point.x,
      cy: point.y,
      r: theme.lineWidth * CALLOUT_DOT_LINE_WIDTHS,
      fill: theme.colors.heading,
      ring: theme.plate,
      ringWidth: theme.lineWidth,
      anim: 'pop',
      lag: true,
    },
    {
      kind: 'text',
      x: right ? box.x : box.x + width,
      y: box.y + lineHeight(style) / 2,
      lines,
      ...(cut ? { cut: annotation.label } : {}),
      style,
      color: theme.colors.value,
      anchor: right ? 'start' : 'end',
      anim: 'fade',
      lag: true,
    },
  ];
}

/**
 * A bracket between two points with the change as its label: over two bars, or beside a line's
 * later point with a guide from the earlier one.
 *
 * @param annotation - The bracket.
 * @param geometry - The plot geometry.
 * @param context - Theme and measurer.
 * @param taken - Boxes labels must avoid; the label's box is added.
 */
function bracketItems(
  annotation: BracketAnnotation,
  geometry: CartesianGeometry,
  context: DrawContext,
  taken: Box[],
): SceneItem[] {
  const { theme, measure } = context;
  const parts: BracketParts = {
    from:
      geometry.tip(annotation.series, annotation.from.index) ??
      valuePoint(geometry, annotation.from),
    to: geometry.tip(annotation.series, annotation.to.index) ?? valuePoint(geometry, annotation.to),
    label: bracketLabel(annotation, theme, measure),
  };
  if (geometry.bracket === 'side' && geometry.orientation === 'vertical') {
    return sideBracketItems(annotation, geometry, theme, parts, taken);
  }

  return overBracketItems(annotation, geometry, theme, parts, taken);
}

/**
 * The label a bracket carries: the change in the value style, in the color its tone asks for.
 *
 * @param annotation - The bracket.
 * @param theme - The chart theme.
 * @param measure - Measures the text.
 */
function bracketLabel(
  annotation: BracketAnnotation,
  theme: ChartTheme,
  measure: Measure,
): BracketLabel {
  const style = { ...theme.text.value };
  return {
    style,
    width: measure(annotation.label, style),
    height: lineHeight(style),
    color: toneTextColor(annotation.tone, theme),
  };
}

/**
 * A bracket beside a column's later point: a guide runs from the earlier point to a bracket that
 * spans the two, and the label sits past it, in a column that clears the boxes already placed.
 *
 * @param annotation - The bracket.
 * @param geometry - The plot geometry.
 * @param theme - The chart theme.
 * @param parts - The bracket's ends and label.
 * @param taken - Boxes labels must avoid; the new boxes are added.
 */
function sideBracketItems(
  annotation: BracketAnnotation,
  geometry: CartesianGeometry,
  theme: ChartTheme,
  parts: BracketParts,
  taken: Box[],
): SceneItem[] {
  const { from, to, label } = parts;
  const stroke = theme.colors.axis;
  const tick = theme.space.sm;
  const x = clearColumn(to.x + theme.space.md, {
    top: Math.min(from.y, to.y) - label.height / 2,
    bottom: Math.max(from.y, to.y) + label.height / 2,
    width: tick + theme.space.sm + label.width,
    gap: theme.space.sm,
    limit: geometry.plot.x + geometry.plot.width,
    taken,
  });
  const thin = theme.lineWidth * 2;
  // The guide and the bracket are lines callouts must not sit on.
  taken.push(
    {
      x: Math.min(from.x, x),
      y: from.y - thin / 2,
      width: Math.abs(x + tick - from.x),
      height: thin,
    },
    { x, y: Math.min(from.y, to.y), width: tick + thin, height: Math.abs(to.y - from.y) },
  );
  const guide: SceneItem = {
    kind: 'line',
    x1: from.x,
    y1: from.y,
    x2: x + tick,
    y2: from.y,
    stroke,
    width: theme.axis.width,
    dash: BRACKET_GUIDE_DASH,
    anim: 'fade',
    lag: true,
  };
  const box = {
    x: x + tick + theme.space.sm,
    y: (from.y + to.y) / 2 - label.height / 2,
    width: label.width,
    height: label.height,
  };
  taken.push(box);
  return [
    guide,
    {
      kind: 'path',
      d: `M${x},${from.y}h${tick}V${to.y}h${-tick}`,
      fill: 'none',
      stroke,
      strokeWidth: theme.lineWidth,
      anim: 'fade',
      lag: true,
    },
    {
      kind: 'text',
      x: box.x,
      y: box.y + label.height / 2,
      lines: [annotation.label],
      style: label.style,
      color: label.color,
      anchor: 'start',
      weight: EMPHASIS_WEIGHT,
      anim: 'fade',
      lag: true,
    },
  ];
}

/**
 * A bracket over two bars or points: a bar above both, with a tick down to each end and the label
 * centred on the bar, routed above every box between the two ends.
 *
 * @param annotation - The bracket.
 * @param geometry - The plot geometry.
 * @param theme - The chart theme.
 * @param parts - The bracket's ends and label.
 * @param taken - Boxes labels must avoid; the new boxes are added.
 */
function overBracketItems(
  annotation: BracketAnnotation,
  geometry: CartesianGeometry,
  theme: ChartTheme,
  parts: BracketParts,
  taken: Box[],
): SceneItem[] {
  const { from, to, label } = parts;
  const stroke = theme.colors.axis;
  const clearance = label.height + theme.space.md;
  // A bar below zero is bracketed from the zero line, the top of its column.
  const zero = geometry.value(0);
  const fromY = Math.min(from.y, zero);
  const toY = Math.min(to.y, zero);
  const left = Math.min(from.x, to.x);
  const right = Math.max(from.x, to.x);
  const labelLeft = (from.x + to.x) / 2 - label.width / 2;
  const cleared = clearBarTop(
    Math.min(fromY, toY) - clearance - theme.space.sm,
    { left, right, labelLeft },
    label,
    theme,
    taken,
  );
  const barTop = Math.max(cleared, label.height + theme.space.xs);
  const box = {
    x: labelLeft,
    y: barTop - theme.space.xs - label.height,
    width: label.width,
    height: label.height,
  };
  taken.push(box, {
    x: left,
    y: barTop - BRACKET_BAR_HEIGHT / 2,
    width: right - left,
    height: BRACKET_BAR_HEIGHT,
  });
  const fromRise = Math.max(fromY - clearance, barTop);
  const toRise = Math.max(toY - clearance, barTop);
  return [
    {
      kind: 'path',
      d: `M${from.x},${fromRise}V${barTop}H${to.x}V${toRise}`,
      fill: 'none',
      stroke,
      strokeWidth: theme.lineWidth,
      anim: 'fade',
      lag: true,
    },
    {
      kind: 'text',
      x: box.x + label.width / 2,
      y: box.y + label.height / 2,
      lines: [annotation.label],
      style: label.style,
      color: label.color,
      anchor: 'middle',
      weight: EMPHASIS_WEIGHT,
      anim: 'fade',
      lag: true,
    },
  ];
}

/**
 * The height a bracket's bar can take: its start, lifted above every box the bar's span and label
 * cover, so the bar runs over every mark, label and reference line between its two ends.
 *
 * @param start - The bar's height before any box is cleared.
 * @param span - The bar's left and right ends, and where its label starts.
 * @param label - The label the bar carries.
 * @param theme - The chart theme.
 * @param taken - The boxes the bar must clear.
 */
function clearBarTop(
  start: number,
  span: { left: number; right: number; labelLeft: number },
  label: BracketLabel,
  theme: ChartTheme,
  taken: readonly Box[],
): number {
  const { left, right, labelLeft } = span;
  let top = start;
  for (const box of taken) {
    const across =
      box.x < Math.max(right, labelLeft + label.width) &&
      box.x + box.width > Math.min(left, labelLeft);
    if (
      across &&
      box.y + box.height > top - theme.space.xs - label.height &&
      box.y < top + theme.space.sm
    ) {
      top = Math.min(top, box.y - theme.space.sm);
    }
  }

  return top;
}

/**
 * The left edge of a column that clears every box it would cross: a side bracket and its label move
 * right, past an end label beside the line, rather than over it.
 *
 * @param x - The column's wanted left edge.
 * @param column - Its vertical extent and width, the gap to keep, the right edge it must stay
 *   inside and the boxes to clear.
 */
function clearColumn(
  x: number,
  column: {
    top: number;
    bottom: number;
    width: number;
    gap: number;
    limit: number;
    taken: readonly Box[];
  },
): number {
  let left = x;
  for (let pass = 0; pass < column.taken.length; pass += 1) {
    // Past the plot's edge the column would only collide with the end labels there: stay put.
    if (left + column.width > column.limit) {
      return x;
    }

    const blocking = column.taken.filter(
      (box) =>
        box.x < left + column.width &&
        box.x + box.width > left &&
        box.y < column.bottom &&
        box.y + box.height > column.top &&
        // Thin boxes along lines are crossed, not avoided.
        box.width > column.gap &&
        box.height > column.gap,
    );
    if (blocking.length === 0) {
      return left;
    }

    left = maxOf(blocking.map((box) => box.x + box.width)) + column.gap;
  }

  return left;
}

/**
 * The point a callout points at.
 *
 * @param annotation - The callout.
 * @param geometry - The plot geometry.
 */
function pointOf(
  annotation: Extract<ResolvedAnnotation, { type: 'callout' }>,
  geometry: CartesianGeometry,
): Point {
  const tip = geometry.tip(annotation.series, annotation.index);
  if (tip === null) {
    return valuePoint(geometry, { index: annotation.index, value: annotation.value ?? 0 });
  }

  // The series' own point, at the value the callout names: never the middle of a category's span,
  // which the plot's edges clip for the first and last categories.
  if (annotation.value === null) {
    return tip;
  }

  const along = geometry.value(annotation.value);
  return geometry.orientation === 'vertical' ? { x: tip.x, y: along } : { x: along, y: tip.y };
}

/**
 * The position of a category's value on the plot.
 *
 * @param geometry - The plot geometry.
 * @param point - The category index and value.
 */
function valuePoint(geometry: CartesianGeometry, point: { index: number; value: number }): Point {
  const [start, end] = geometry.span(point.index);
  const along = (start + end) / 2;
  const across = geometry.value(point.value);
  return geometry.orientation === 'vertical' ? { x: along, y: across } : { x: across, y: along };
}

/**
 * The point on a box's edge nearest a point outside it, where a leader meets the label.
 *
 * @param box - The label's box.
 * @param point - The point the leader starts at.
 */
function nearestEdge(box: Box, point: Point): Point {
  const x = Math.min(Math.max(point.x, box.x), box.x + box.width);
  const y = Math.min(Math.max(point.y, box.y), box.y + box.height);
  return { x, y };
}

/**
 * The color a change is written in as small text: the positive role's text color for good news, the
 * negative's for bad, held to 4.5:1 where the roles themselves are held only to 3:1.
 *
 * @param tone - Whether the change is good news.
 * @param theme - The chart theme.
 */
export function toneTextColor(
  tone: 'positive' | 'negative' | 'neutral',
  theme: ChartTheme,
): string {
  switch (tone) {
    case 'positive': {
      return theme.colors.positiveText;
    }

    case 'negative': {
      return theme.colors.negativeText;
    }

    case 'neutral': {
      return theme.colors.value;
    }
  }
}

/**
 * The color a change is drawn in as a mark: the positive role for good news, the negative for bad.
 *
 * @param tone - Whether the change is good news.
 * @param theme - The chart theme.
 */
export function toneColor(tone: 'positive' | 'negative' | 'neutral', theme: ChartTheme): string {
  switch (tone) {
    case 'positive': {
      return theme.colors.positive;
    }

    case 'negative': {
      return theme.colors.negative;
    }

    case 'neutral': {
      return theme.colors.value;
    }
  }
}
