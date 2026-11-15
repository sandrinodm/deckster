import type { ReactNode } from 'react';

import type { ChartDrawing, DrawInput, FrameProps } from '#charts/frame/chart-frame.tsx';
import type { SceneItem } from '#charts/frame/scene.ts';

import { resolveFormat } from '#charts/format/number-format.ts';
import { ChartFrame, frameProps } from '#charts/frame/chart-frame.tsx';
import { checkProps, propNames } from '#charts/frame/check-props.ts';
import { drawScene } from '#charts/frame/scene-svg.tsx';
import { buildSpec } from '#charts/frame/spec-builder.ts';
import { lineHeight, widestLine, wrapLines, type TextStyle } from '#charts/layout/text-measure.ts';

/**
 * The shapes a pictogram's units can take.
 */
export const PICTOGRAM_SHAPES = ['person', 'circle', 'square'] as const;

/**
 * The share of the width the unit grid takes beside the figure.
 */
const GRID_SHARE = 0.56;

/**
 * The gap between units as a share of a unit.
 */
const UNIT_GAP = 0.22;

/**
 * The least share of the best-fitting unit size a round number of units per row may keep.
 */
const ROUND_FIT = 0.66;

/**
 * The least share of the best-fitting unit size a number of units per row that fills every row may
 * keep: 10 reads as two rows of five rather than three rows of three and one left over.
 */
const FULL_ROWS_FIT = 0.8;

/**
 * The least share of the stat step the figure may be scaled to beside the grid; below it the text
 * goes under the grid.
 */
const MIN_SIDE_SCALE = 0.75;

/**
 * The most lines the label may take beside the grid; past them the text goes under the grid.
 */
const SIDE_LABEL_LINES = 3;

/**
 * The most lines a label takes anywhere; past them it is cut, and `deck lint` reports it.
 */
const MAX_LABEL_LINES = 5;

/**
 * How many units a pictogram draws when it sets no `total`.
 */
const DEFAULT_TOTAL = 10;

/**
 * The most units a pictogram draws.
 */
const MAX_TOTAL = 100;

/**
 * The base of the counts that read as rounds: a total divisible by it prefers a round row width.
 */
const ROUND_BASE = 10;

/**
 * The units per row that read as rounds, tried in this order.
 */
const ROUND_COUNTS = [10, 20, 5, 25, 50] as const;

/**
 * The corner radius of a square unit, as a share of the unit.
 */
const SQUARE_CORNER_SHARE = 0.14;

/**
 * The radius of a person's head, as a share of the unit.
 */
const PERSON_HEAD_SHARE = 0.19;

/**
 * The half-width of a person's shoulders, as a share of the unit.
 */
const PERSON_SHOULDER_SHARE = 0.3;

/**
 * Where a person's body starts below the top of the unit, as a share of the unit.
 */
const PERSON_BODY_TOP_SHARE = 0.47;

/**
 * Props of {@link Pictogram}.
 */
export type PictogramProps = FrameProps & {
  /**
   * How many units are filled: 3 of 10.
   */
  value: number;

  /**
   * How many units there are; 10 when left out, at most 100.
   */
  total?: number;

  /**
   * What the filled units are: "questions answered by the help centre".
   */
  label: string;

  /**
   * The unit's shape: a `person` (the default), a `circle` or a `square`.
   */
  shape?: (typeof PICTOGRAM_SHAPES)[number];

  /**
   * Units per row; chosen from the room when left out.
   */
  columns?: number;
};

/**
 * Every prop {@link Pictogram} takes, checked against its props type at compile time and against the
 * catalog by its test.
 */
export const PICTOGRAM_PROPS = propNames<PictogramProps>()([
  'at',
  'caption',
  'source',
  'label',
  'value',
  'total',
  'shape',
  'columns',
]);

/**
 * A unit chart for a proportion that should feel human: "3 in 10". The filled units in the lead
 * data color, the rest in the context color, beside the figure written as "3 in 10" and what the
 * units are.
 *
 * ```mdx
 * <Pictogram value={3} total={10} label="questions now end in the help centre" />
 * ```
 */
export function Pictogram(props: PictogramProps): ReactNode {
  checkProps('Pictogram', props);
  checkTotal(props);
  return (
    <ChartFrame
      kind="pictogram"
      {...frameProps(props)}
      draw={(input) => drawPictogram(props, input)}
    />
  );
}

/**
 * Where a pictogram puts its parts: the grid of units, and the figure with its label beside the
 * grid or under it.
 */
export type PictogramPlan = {
  /**
   * `side`: the text beside the grid, for wide rooms; `stacked`: under it, for narrow columns.
   */
  arrangement: 'side' | 'stacked';

  /**
   * Units per row.
   */
  columns: number;

  /**
   * The side of one unit.
   */
  unit: number;

  /**
   * The gap between units.
   */
  gap: number;

  /**
   * The grid's top edge.
   */
  gridTop: number;

  /**
   * The text's left edge.
   */
  textX: number;

  /**
   * The text block's top edge.
   */
  textTop: number;

  /**
   * The figure's style, scaled down from the stat step when the room is narrower than it.
   */
  stat: TextStyle;

  /**
   * The label's lines.
   */
  lines: string[];

  /**
   * Whether the label had to be cut to fit, which `deck lint` reports.
   */
  cut: boolean;
};

/**
 * The text beside or under the grid: the figure, scaled to the width, and the label wrapped to it.
 */
type TextBlock = {
  /**
   * The figure's style.
   */
  stat: TextStyle;

  /**
   * How much the figure was scaled down to fit the width.
   */
  scale: number;

  /**
   * The label's lines.
   */
  lines: string[];

  /**
   * Whether the label was cut.
   */
  cut: boolean;

  /**
   * The block's height.
   */
  height: number;
};

/**
 * Lays out the pictogram for the measured region.
 *
 * @param props - The figure's props.
 * @param input - The region size, theme and measurer.
 */
function drawPictogram(props: PictogramProps, input: DrawInput): ChartDrawing {
  const { theme, size } = input;
  const total = unitTotal(props);
  const value = Math.max(0, Math.min(total, Math.round(props.value)));
  const plan = planPictogram(props, input);
  const lead = theme.categorical[0] ?? theme.colors.accent;
  const items: SceneItem[] = unitItems(plan, {
    shape: props.shape ?? 'person',
    total,
    value,
    filledColor: lead,
    restColor: theme.context,
  });
  const figure = figureOf(props);
  const titleStyle = theme.text.heading;
  items.push(
    {
      kind: 'text',
      x: plan.textX,
      y: plan.textTop + plan.stat.size / 2,
      lines: [figure],
      style: plan.stat,
      color: theme.colors.stat,
      anchor: 'start',
      anim: 'fade',
      lag: true,
    },
    {
      kind: 'text',
      x: plan.textX,
      y: plan.textTop + plan.stat.size + theme.space.md + lineHeight(titleStyle) / 2,
      lines: plan.lines,
      style: titleStyle,
      color: theme.colors.value,
      anchor: 'start',
      anim: 'fade',
      lag: true,
      ...(plan.cut ? { cut: props.label } : {}),
    },
  );
  const format = resolveFormat(undefined, undefined, theme.numbers);
  const spec = buildSpec(
    {
      kind: 'pictogram',
      name: `${figure} ${props.label}`,
      summary: `${figure} ${props.label}.`,
      categories: ['filled', 'rest'],
      series: [
        {
          name: props.label,
          values: [value, total - value],
          x: null,
          color: lead,
          pointColors: [lead, theme.context],
          highlighted: true,
          labels: [figure, null],
        },
      ],
      figures: [
        {
          value: figure,
          number: value / total,
          label: props.label,
          delta: null,
          tone: null,
          highlighted: true,
          color: theme.colors.stat,
        },
      ],
    },
    { theme, format, largest: total, caption: props.caption, source: props.source },
  );
  return drawScene(
    {
      scene: {
        width: size.width,
        height: size.height,
        layers: [{ at: undefined, items }],
        highlightAt: undefined,
      },
      spec,
      facts: {
        series: 1,
        categories: 2,
        highlighted: true,
        axis: 'none',
        unit: true,
        legend: false,
        legendAvoidable: false,
        marks: total,
      },
    },
    input,
  );
}

/**
 * The scene items of the units: one path per unit, the first `value` in the filled color and the
 * rest in the context color, in reading order.
 *
 * @param plan - The grid's planned units, columns and top edge.
 * @param units - The shape, the count, how many are filled and the two colors.
 */
function unitItems(
  plan: PictogramPlan,
  units: {
    shape: (typeof PICTOGRAM_SHAPES)[number];
    total: number;
    value: number;
    filledColor: string;
    restColor: string;
  },
): SceneItem[] {
  const { unit, gap, columns } = plan;
  const items: SceneItem[] = [];
  for (let index = 0; index < units.total; index += 1) {
    const x = (index % columns) * (unit + gap);
    const y = plan.gridTop + Math.floor(index / columns) * (unit + gap);
    const filled = index < units.value;
    items.push({
      kind: 'path',
      d: unitPath(units.shape, x, y, unit),
      fill: filled ? units.filledColor : units.restColor,
      anim: 'pop',
      order: index,
      mark: true,
    });
  }

  return items;
}

/**
 * How many units a pictogram draws: its `total`, 10 when left out, between 1 and 100.
 *
 * @param props - The figure's props.
 */
function unitTotal(props: PictogramProps): number {
  return Math.max(1, Math.min(MAX_TOTAL, Math.round(props.total ?? DEFAULT_TOTAL)));
}

/**
 * Fails when a pictogram's total is more units than it draws: fewer units would show another ratio
 * than the data has ("1 in 100" for 1 in 1,000).
 *
 * @param props - The figure's props.
 * @throws Error naming the total and the component to use instead.
 */
function checkTotal(props: PictogramProps): void {
  if (props.total !== undefined && !(props.total <= MAX_TOTAL)) {
    throw new Error(
      `Pictogram draws at most ${MAX_TOTAL} units and \`total\` is ${props.total}; fewer units ` +
        `would show another ratio than the data has. Give a \`total\` of at most ${MAX_TOTAL}, ` +
        'or say it as a number with <BigNumber>.',
    );
  }
}

/**
 * The figure a pictogram writes: "3 in 10".
 *
 * @param props - The figure's props.
 */
export function figureOf(props: PictogramProps): string {
  const total = unitTotal(props);
  return `${Math.max(0, Math.min(total, Math.round(props.value)))} in ${total}`;
}

/**
 * Plans a pictogram for its room. The text sits beside the grid when the figure keeps most of its
 * size there and the label takes at most three lines; otherwise (a narrow column) it goes under the
 * grid, at the room's full width. The figure scales down to the width it has and the label wraps to
 * as many lines as it needs, so nothing runs past the room; a label too long for even that is cut
 * and marked, which `deck lint` reports.
 *
 * @param props - The figure's props.
 * @param input - The room, the theme and the measurer.
 */
export function planPictogram(
  props: PictogramProps,
  input: Pick<DrawInput, 'size' | 'theme' | 'measure'>,
): PictogramPlan {
  const { theme, size } = input;
  const total = unitTotal(props);
  const sideGrid = size.width * GRID_SHARE;
  const sideText = textBlock(props, size.width - sideGrid - theme.space.xl, input);
  const sideFits =
    sideText.scale >= MIN_SIDE_SCALE &&
    sideText.lines.length <= SIDE_LABEL_LINES &&
    !sideText.cut &&
    sideText.height <= size.height;
  if (sideFits) {
    const grid = unitGrid(props, total, sideGrid, size.height);
    return {
      arrangement: 'side',
      ...grid,
      gridTop: (size.height - grid.height) / 2,
      textX: sideGrid + theme.space.xl,
      textTop: (size.height - sideText.height) / 2,
      stat: sideText.stat,
      lines: sideText.lines,
      cut: sideText.cut,
    };
  }

  const text = textBlock(props, size.width, input);
  const room = Math.max(0, size.height - text.height - theme.space.xl);
  const grid = unitGrid(props, total, size.width, room);
  const top = (size.height - (grid.height + theme.space.xl + text.height)) / 2;
  return {
    arrangement: 'stacked',
    ...grid,
    gridTop: Math.max(0, top),
    textX: 0,
    textTop: Math.max(0, top) + grid.height + theme.space.xl,
    stat: text.stat,
    lines: text.lines,
    cut: text.cut,
  };
}

/**
 * The figure and label set in a width: the figure scaled down to fit it, the label wrapped to it.
 *
 * @param props - The figure's props.
 * @param width - The width the text has.
 * @param input - The theme and the measurer.
 */
function textBlock(
  props: PictogramProps,
  width: number,
  input: Pick<DrawInput, 'theme' | 'measure'>,
): TextBlock {
  const { theme, measure } = input;
  const room = Math.max(1, width);
  const base = theme.text.stat;
  const scale = Math.min(1, room / Math.max(1, measure(figureOf(props), base)));
  const stat = { ...base, size: base.size * scale, lineHeight: 1 };
  const titleStyle = theme.text.heading;
  const wrapped = wrapLines(props.label, room, {
    measure,
    style: titleStyle,
    maxLines: MAX_LABEL_LINES,
  });
  return {
    stat,
    scale,
    lines: wrapped.lines,
    cut: wrapped.cut || widestLine(wrapped.lines, measure, titleStyle) > room + 1,
    height: stat.size + theme.space.md + wrapped.lines.length * lineHeight(titleStyle),
  };
}

/**
 * The grid of units in a box: units per row, their size and gap, and the grid's height.
 *
 * @param props - The figure's props, for `columns`.
 * @param total - How many units.
 * @param width - The box's width.
 * @param height - The box's height.
 */
function unitGrid(
  props: PictogramProps,
  total: number,
  width: number,
  height: number,
): { columns: number; unit: number; gap: number; height: number } {
  const columns = props.columns ?? bestColumns(total, width, height);
  const rows = Math.ceil(total / columns);
  const unit = Math.max(0, unitSide(columns, rows, width, height));
  const gap = unit * UNIT_GAP;
  return { columns, unit, gap, height: rows * unit + (rows - 1) * gap };
}

/**
 * The side of a unit when the grid of `columns` by `rows` units (with gaps) fits a box.
 *
 * @param columns - Units per row.
 * @param rows - Rows of units.
 * @param width - The box's width.
 * @param height - The box's height.
 */
function unitSide(columns: number, rows: number, width: number, height: number): number {
  return Math.min(
    width / (columns + (columns - 1) * UNIT_GAP),
    height / (rows + (rows - 1) * UNIT_GAP),
  );
}

/**
 * The units per row that make the largest units in a box. A total divisible by ten counts in tens:
 * 10 or 20 per row (or 5 for small totals) when that costs little size against the best fit, so 100
 * reads as ten rows of ten rather than 13 to a row. Otherwise a width that fills every row wins
 * when it costs at most a fifth of the size.
 *
 * @param total - How many units.
 * @param width - The box's width.
 * @param height - The box's height.
 */
export function bestColumns(total: number, width: number, height: number): number {
  /**
   * The side of a unit at some units per row.
   */
  const unitAt = (columns: number): number =>
    unitSide(columns, Math.ceil(total / columns), width, height);
  let best = 1;
  let bestUnit = 0;
  for (let columns = 1; columns <= total; columns += 1) {
    const unit = unitAt(columns);
    if (unit > bestUnit) {
      best = columns;
      bestUnit = unit;
    }
  }

  if (total % ROUND_BASE === 0) {
    // Round counts read faster: take the best round width unless it shrinks units by a third.
    const round = ROUND_COUNTS.filter((columns) => columns <= total && total % columns === 0);
    const pick = round.toSorted((a, b) => unitAt(b) - unitAt(a))[0];
    if (pick !== undefined && unitAt(pick) >= bestUnit * ROUND_FIT) {
      return pick;
    }
  }

  // Full rows read as a count; a last row with a few units left over reads as a remainder.
  const full = Array.from({ length: total }, (_, index) => index + 1).filter(
    (columns) => total % columns === 0,
  );
  const fullPick = full.toSorted((a, b) => unitAt(b) - unitAt(a))[0];
  return fullPick !== undefined && unitAt(fullPick) >= bestUnit * FULL_ROWS_FIT ? fullPick : best;
}

/**
 * The path of one unit in a square cell.
 *
 * @param shape - The unit's shape.
 * @param x - The cell's left edge.
 * @param y - The cell's top edge.
 * @param size - The cell's side.
 */
function unitPath(
  shape: (typeof PICTOGRAM_SHAPES)[number],
  x: number,
  y: number,
  size: number,
): string {
  switch (shape) {
    case 'circle': {
      const r = size / 2;
      return `M${x},${y + r}a${r},${r} 0 1 0 ${size},0a${r},${r} 0 1 0 ${-size},0Z`;
    }

    case 'square': {
      const r = size * SQUARE_CORNER_SHARE;
      return `M${x + r},${y}h${size - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${size - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${-(size - 2 * r)}a${r},${r} 0 0 1 ${-r},${-r}v${-(size - 2 * r)}a${r},${r} 0 0 1 ${r},${-r}Z`;
    }

    case 'person': {
      const head = size * PERSON_HEAD_SHARE;
      const cx = x + size / 2;
      const shoulders = size * PERSON_SHOULDER_SHARE;
      const bodyTop = y + size * PERSON_BODY_TOP_SHARE;
      const bottom = y + size;
      const headPath = `M${cx - head},${y + head}a${head},${head} 0 1 0 ${head * 2},0a${head},${head} 0 1 0 ${-head * 2},0Z`;
      const body = `M${cx - shoulders},${bottom}V${bodyTop + shoulders}a${shoulders},${shoulders} 0 0 1 ${shoulders * 2},0V${bottom}Z`;
      return `${headPath}${body}`;
    }
  }
}
