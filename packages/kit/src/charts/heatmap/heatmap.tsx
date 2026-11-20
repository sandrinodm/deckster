import type { ReactNode } from 'react';

import type { ChartKind, ChartSpec } from '#charts/chart-spec.ts';
import type { ResolvedFormat } from '#charts/format/number-format.ts';
import type { ChartDrawing, ChartFacts, DrawInput } from '#charts/frame/chart-frame.tsx';
import type { ChartProps } from '#charts/frame/chart-props.ts';
import type { ChartTheme } from '#charts/frame/chart-theme.ts';
import type { SceneItem, SceneLayer } from '#charts/frame/scene.ts';
import type { Measure, TextStyle } from '#charts/layout/text-measure.ts';

import { fieldKinds, resolveRows, toLabel, toNumber } from '#charts/data/rows.ts';
import { resolveFormat, runFormatter } from '#charts/format/number-format.ts';
import { ChartFrame, frameProps } from '#charts/frame/chart-frame.tsx';
import { hasUnit } from '#charts/frame/chart-input.ts';
import { checkProps, propNames } from '#charts/frame/check-props.ts';
import { textOn } from '#charts/frame/plot-parts.ts';
import { drawScene } from '#charts/frame/scene-svg.tsx';
import { buildSpec } from '#charts/frame/spec-builder.ts';
import { EMPHASIS_WEIGHT, lineHeight } from '#charts/layout/text-measure.ts';
import { maxOf, minOf } from '#foundation/lists.ts';

/**
 * The gap between cells, in the plate's color.
 */
const CELL_GAP = 3;

/**
 * The gap between the swatches of the scale legend, in canvas pixels.
 */
const SWATCH_GAP = 2;

/**
 * Cohort labels and focus steps supplied by the retention preset. Missing cells stay blank.
 */
export type HeatmapCohort = {
  /**
   * The starting population by cohort label.
   */
  sizes: ReadonlyMap<string, number>;

  /**
   * The headings for the cohort name and population columns.
   */
  headings: readonly [string, string];

  /**
   * The age headings in increasing numeric order.
   */
  ages: readonly string[];

  /**
   * The row then column to outline, or undefined for an overview with neither.
   */
  focus: { row: string; column: string; from: number | undefined } | undefined;
};

/**
 * Props of {@link Heatmap}.
 */
export type HeatmapProps = Omit<ChartProps, 'highlight' | 'annotations' | 'labels' | 'legend'> & {
  /**
   * The field naming each column; the first text field when left out.
   */
  x?: string;

  /**
   * The field naming each row; the second text field when left out.
   */
  y?: string;

  /**
   * The field with each cell's value; the first number field when left out.
   */
  value?: string;

  /**
   * Cells to outline, as `{ x, y }` (a column and a row), or a whole column or row by name.
   */
  highlight?: { x?: string; y?: string } | readonly { x?: string; y?: string }[];

  /**
   * The words at the two ends of the scale legend.
   */
  scale?: readonly [string, string];
};

/**
 * Every prop {@link Heatmap} takes, checked against its props type at compile time and against the
 * catalog by its test.
 */
export const HEATMAP_PROPS = propNames<HeatmapProps>()([
  'at',
  'caption',
  'source',
  'label',
  'data',
  'format',
  'unit',
  'x',
  'y',
  'value',
  'highlight',
  'scale',
]);

/**
 * A heatmap for a pattern across two dimensions (weekday by hour, region by month): cells in the
 * brand's sequential palette from the smallest value to the largest, values printed in the cells
 * that have room (in light or dark text by the cell), the highlighted cells outlined, and a small
 * scale legend.
 *
 * ```mdx
 * <Heatmap data={load} x="hour" y="day" value="tickets" highlight={{ x: '9–11', y: 'Mon' }} />
 * ```
 */
export function Heatmap(props: HeatmapProps): ReactNode {
  checkProps('Heatmap', props);
  return (
    <ChartFrame kind="heatmap" {...frameProps(props)} draw={(input) => drawHeatmap(props, input)} />
  );
}

/**
 * Everything the grid of a heatmap is drawn with, worked out once for the whole chart.
 */
type HeatmapGrid = {
  /**
   * The chart theme.
   */
  theme: ChartTheme;

  /**
   * Measures text.
   */
  measure: Measure;

  /**
   * The column names, in order of first appearance.
   */
  columns: readonly string[];

  /**
   * The row names, in order of first appearance.
   */
  lines: readonly string[];

  /**
   * Cohort sizes, when the retention preset supplies them.
   */
  cohort: HeatmapCohort | undefined;

  /**
   * Each cell's value by its column and row, `null` where it has none.
   */
  cells: ReadonlyMap<string, number | null>;

  /**
   * The smallest value.
   */
  low: number;

  /**
   * The largest value.
   */
  high: number;

  /**
   * Writes one value in the chart's format.
   */
  write: (value: number) => string;

  /**
   * The sequential palette, from the smallest step to the largest.
   */
  palette: readonly string[];

  /**
   * Whether a cell is outlined as highlighted.
   */
  outlined: (column: string, row: string) => boolean;

  /**
   * The style of the axis labels.
   */
  axisStyle: TextStyle;

  /**
   * The style of the values printed in the cells.
   */
  valueStyle: TextStyle;

  /**
   * The vertical centre of the column labels.
   */
  headerY: number;

  /**
   * The x where the grid starts, after the row labels.
   */
  rowLabels: number;

  /**
   * The width reserved for cohort sizes, including their gap from the tiles.
   */
  sizeLabels: number;

  /**
   * The y where the grid starts, under the column labels and the scale legend.
   */
  top: number;

  /**
   * The width of one column.
   */
  cellWidth: number;

  /**
   * The height of one row.
   */
  cellHeight: number;
};

/**
 * Lays out and draws the heatmap for the measured plot.
 *
 * @param props - The chart's props.
 * @param input - The plot size, theme and measurer.
 * @param cohort - The retention preset's labels and focus, when used.
 */
export function drawHeatmap(
  props: HeatmapProps,
  input: DrawInput,
  cohort?: HeatmapCohort,
): ChartDrawing {
  const { theme, measure, size } = input;
  const rows = resolveRows(props.data, input.datasets);
  const kinds = fieldKinds(rows);
  const xField = props.x ?? kinds.text[0] ?? '';
  const yField = props.y ?? kinds.text.find((field) => field !== xField) ?? '';
  const valueField =
    props.value ?? kinds.numbers.find((field) => field !== xField && field !== yField) ?? '';
  const columns = cohort?.ages ?? [...new Set(rows.map((row) => toLabel(row[xField])))];
  const lines = [...new Set(rows.map((row) => toLabel(row[yField])))];
  const cells = new Map(
    rows.map((row) => [
      cellKey(toLabel(row[xField]), toLabel(row[yField])),
      toNumber(row[valueField]),
    ]),
  );
  const values = [...cells.values()].filter((value) => value !== null);
  const low = minOf(values);
  const high = maxOf(values);
  const format = resolveFormat(props.format, props.unit, theme.numbers);
  const write = runFormatter(values, format);
  const axisStyle = theme.text.axis;
  const legendRoom = lineHeight(axisStyle) + theme.space.md;
  const top = legendRoom + lineHeight(axisStyle) + theme.space.sm;
  const nameLabels = cohort === undefined ? lines : [cohort.headings[0], ...lines];
  const sizeLabels = cohortSizeWidth(cohort, input);
  const rowLabels =
    maxOf(
      nameLabels.map((line) => measure(line, axisStyle)),
      0,
    ) +
    theme.space.md +
    sizeLabels;
  const grid: HeatmapGrid = {
    theme,
    measure,
    columns,
    lines,
    cohort,
    cells,
    low,
    high,
    write,
    palette: theme.sequential,
    outlined: outlinedCells(props.highlight),
    axisStyle,
    valueStyle: theme.text.value,
    headerY: legendRoom + lineHeight(axisStyle) / 2,
    rowLabels,
    sizeLabels,
    top,
    cellWidth: Math.max(0, size.width - rowLabels) / Math.max(1, columns.length),
    cellHeight: Math.max(0, size.height - top) / Math.max(1, lines.length),
  };
  const items: SceneItem[] = [
    ...columnHeaderItems(grid),
    ...rowItems(grid),
    ...scaleLegend(props.scale ?? ['Fewer', 'More'], { theme, measure, width: size.width }),
  ];
  const facts: ChartFacts = {
    series: lines.length,
    categories: columns.length,
    highlighted: true,
    axis: 'none',
    unit: hasUnit(props, format),
    legend: true,
    legendAvoidable: false,
  };
  const spec = heatmapSpec(props, grid, { x: xField, y: yField, value: valueField }, format);
  return drawScene(
    {
      scene: {
        width: size.width,
        height: size.height,
        layers: [{ at: undefined, items }, ...cohortFocusLayers(grid)],
        highlightAt: undefined,
      },
      spec,
      facts,
    },
    input,
  );
}

/**
 * Reserves one aligned column for the starting population, in canvas pixels.
 */
function cohortSizeWidth(cohort: HeatmapCohort | undefined, input: DrawInput): number {
  if (cohort === undefined) {
    return 0;
  }

  const { theme, measure } = input;
  const labels = [
    cohort.headings[1],
    ...[...cohort.sizes.values()].map((value) => sizeText(value, theme)),
  ];
  return (
    maxOf(
      labels.map((label) => measure(label, theme.text.axis)),
      0,
    ) + theme.space.md
  );
}

/**
 * Each step outlines only the observed cells for that reading of the grid.
 */
function cohortFocusLayers(grid: HeatmapGrid): SceneLayer[] {
  const focus = grid.cohort?.focus;
  if (focus === undefined) {
    return [];
  }

  const column = grid.columns.indexOf(focus.column);
  const columnItems = grid.lines.flatMap((name, row) =>
    focusCell(grid, focus.column, column, name, row),
  );
  if (focus.from === undefined) {
    return [{ at: undefined, items: columnItems }];
  }

  const row = grid.lines.indexOf(focus.row);
  const rowItems = grid.columns.flatMap((name, index) =>
    focusCell(grid, name, index, focus.row, row),
  );
  return [
    { at: focus.from, until: focus.from + 1, items: rowItems },
    { at: focus.from + 1, items: columnItems },
  ];
}

/**
 * Outlines a measured tile, leaving the immature part of a cohort untouched.
 */
function focusCell(
  grid: HeatmapGrid,
  column: string,
  columnIndex: number,
  row: string,
  rowIndex: number,
): SceneItem[] {
  if (cellValue(grid.cells, column, row) === null || !hasTileRoom(grid)) {
    return [];
  }

  return [
    {
      kind: 'path',
      d: tilePath(grid, columnIndex, rowIndex),
      fill: 'none',
      stroke: grid.theme.colors.heading,
      strokeWidth: grid.theme.lineWidth,
      anim: 'fade',
    },
  ];
}

/**
 * The heatmap's chart spec: each row as a series of cell values, colors and labels, and a summary
 * that names the range and the highest cell.
 *
 * @param props - The chart's props.
 * @param grid - The heatmap's grid.
 * @param fields - The names of the column, row and value fields.
 * @param format - The chart's resolved format.
 */
function heatmapSpec(
  props: HeatmapProps,
  grid: HeatmapGrid,
  fields: { x: string; y: string; value: string },
  format: ResolvedFormat,
): ChartSpec {
  const { theme, columns, lines, cells, low, high, write, palette, cohort } = grid;
  const kind: ChartKind = cohort === undefined ? 'heatmap' : 'retention-cohorts';
  const name =
    cohort === undefined
      ? `Heatmap of ${fields.value} by ${fields.y} and ${fields.x}`
      : 'Retention by signup cohort and age';
  const summary =
    cohort === undefined
      ? `${lines.length} rows by ${columns.length} columns, from ${write(low)} to ${write(high)}.${highestText(cells, write)}`
      : cohortSummary(grid, cohort);
  return buildSpec(
    {
      kind,
      name,
      summary,
      categories: columns,
      series: lines.map((line) => ({
        name: line,
        values: columns.map((name) => cellValue(cells, name, line)),
        x: null,
        color: palette.at(-1) ?? theme.context,
        pointColors: columns.map((name) => {
          const value = cellValue(cells, name, line);
          return value === null ? theme.colors.grid : stepColor(value, low, high, palette);
        }),
        highlighted: false,
        labels: columns.map((name) => {
          const value = cellValue(cells, name, line);
          return value === null ? null : write(value);
        }),
      })),
      legend: true,
      ...(cohort?.focus === undefined
        ? {}
        : {
            highlight: {
              series: [],
              categories: [cohort.focus.column],
              points: [],
              range: null,
            },
          }),
    },
    {
      theme,
      format,
      largest: Math.max(Math.abs(low), Math.abs(high)),
      caption: props.caption,
      source: props.source,
    },
  );
}

/**
 * Describes cohort sizes, observed rates and immature cells for the static chart.
 */
function cohortSummary(grid: HeatmapGrid, cohort: HeatmapCohort): string {
  const rows = grid.lines.map((row) => {
    const size = sizeText(cohort.sizes.get(row) ?? 0, grid.theme);
    const observed = grid.columns.flatMap((column) => {
      const value = cellValue(grid.cells, column, row);
      return value === null ? [] : [`${column} ${grid.write(value)}`];
    });
    return `${row}, ${size} at signup: ${observed.join(', ') || 'no observations'}.`;
  });
  const focus = cohort.focus === undefined ? '' : ` Comparison at ${cohort.focus.column}.`;
  return `Blank cells have no observed rate.${focus} ${rows.join(' ')}`;
}

/**
 * The key a cell is stored under: its column and its row, as one JSON pair so that no name can run
 * into another.
 *
 * @param column - The column's name.
 * @param row - The row's name.
 */
function cellKey(column: string, row: string): string {
  return JSON.stringify([column, row]);
}

/**
 * The value of the cell at a column and a row, `null` where the data has none.
 *
 * @param cells - Every cell's value by its key.
 * @param column - The column's name.
 * @param row - The row's name.
 */
function cellValue(
  cells: ReadonlyMap<string, number | null>,
  column: string,
  row: string,
): number | null {
  return cells.get(cellKey(column, row)) ?? null;
}

/**
 * The column names, centred over their columns above the grid.
 *
 * @param grid - The heatmap's grid.
 */
function columnHeaderItems(grid: HeatmapGrid): SceneItem[] {
  const headings = grid.columns.map((name, column): SceneItem => ({
    kind: 'text',
    x: grid.rowLabels + column * grid.cellWidth + grid.cellWidth / 2,
    y: grid.headerY,
    lines: [name],
    style: grid.axisStyle,
    color: grid.theme.colors.label,
    anchor: 'middle',
  }));
  if (grid.cohort === undefined) {
    return headings;
  }

  return [
    rowLabel(grid.cohort.headings[0], grid.headerY, grid, 'name'),
    rowLabel(grid.cohort.headings[1], grid.headerY, grid, 'size'),
    ...headings,
  ];
}

/**
 * Every row: its name at the left of the grid, then its cells.
 *
 * @param grid - The heatmap's grid.
 */
function rowItems(grid: HeatmapGrid): SceneItem[] {
  const items: SceneItem[] = [];
  for (const [row, line] of grid.lines.entries()) {
    const y = grid.top + row * grid.cellHeight + grid.cellHeight / 2;
    items.push(rowLabel(line, y, grid, 'name'));
    const size = grid.cohort?.sizes.get(line);
    if (size !== undefined) {
      items.push(rowLabel(sizeText(size, grid.theme), y, grid, 'size'));
    }

    for (const [column, name] of grid.columns.entries()) {
      for (const item of cellItems(grid, name, column, line, row)) {
        items.push(item);
      }
    }
  }

  return items;
}

/**
 * The name of a row, right-aligned at the left of the grid.
 *
 * @param line - The label's text.
 * @param y - The vertical center of the row or heading.
 * @param grid - The heatmap's grid.
 * @param field - The name or population column.
 */
function rowLabel(line: string, y: number, grid: HeatmapGrid, field: 'name' | 'size'): SceneItem {
  const gutter = grid.rowLabels - grid.theme.space.md;
  const isSize = field === 'size';
  return {
    kind: 'text',
    x: isSize ? gutter : gutter - grid.sizeLabels,
    y,
    lines: [line],
    style: grid.axisStyle,
    color: grid.theme.colors.label,
    anchor: 'end',
    tabular: isSize,
  };
}

/**
 * Formats an integer cohort size in the brand's number locale.
 */
function sizeText(size: number, theme: ChartTheme): string {
  return new Intl.NumberFormat(theme.numbers.locale).format(size);
}

/**
 * One cell: its tile in the step of the palette its value falls in, outlined when highlighted, and
 * its value printed in it when the tile has room.
 *
 * @param grid - The heatmap's grid.
 * @param column - The column's name.
 * @param columnIndex - The column's position.
 * @param row - The row's name.
 * @param rowIndex - The row's position.
 */
function cellItems(
  grid: HeatmapGrid,
  column: string,
  columnIndex: number,
  row: string,
  rowIndex: number,
): SceneItem[] {
  const { theme, measure, write } = grid;
  const value = cellValue(grid.cells, column, row);
  if ((grid.cohort !== undefined && value === null) || !hasTileRoom(grid)) {
    return [];
  }

  const fill =
    value === null ? theme.colors.grid : stepColor(value, grid.low, grid.high, grid.palette);
  const box = {
    x: grid.rowLabels + columnIndex * grid.cellWidth + CELL_GAP / 2,
    y: grid.top + rowIndex * grid.cellHeight + CELL_GAP / 2,
    width: grid.cellWidth - CELL_GAP,
    height: grid.cellHeight - CELL_GAP,
  };
  const strong = grid.outlined(column, row);
  const order = columnIndex + rowIndex;
  const items: SceneItem[] = [
    {
      kind: 'path',
      d: tilePath(grid, columnIndex, rowIndex),
      fill,
      ...(strong ? { stroke: theme.colors.heading, strokeWidth: theme.lineWidth } : {}),
      anim: 'fade',
      order,
      mark: true,
    },
  ];
  const text = value === null ? '' : write(value);
  const fits =
    text !== '' &&
    measure(text, grid.valueStyle) + theme.space.sm <= box.width &&
    lineHeight(grid.valueStyle) <= box.height;
  if (fits) {
    items.push({
      kind: 'text',
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
      lines: [text],
      style: grid.valueStyle,
      color: textOn(fill, theme),
      background: fill,
      anchor: 'middle',
      ...(strong ? { weight: EMPHASIS_WEIGHT } : {}),
      anim: 'fade',
      lag: true,
      order,
    });
  }

  return items;
}

/**
 * Whether the available plot is large enough to draw a positive-size tile.
 */
function hasTileRoom(grid: HeatmapGrid): boolean {
  return grid.cellWidth > CELL_GAP && grid.cellHeight > CELL_GAP;
}

/**
 * The path shared by a tile and its focus outline.
 */
function tilePath(grid: HeatmapGrid, column: number, row: number): string {
  const x = grid.rowLabels + column * grid.cellWidth + CELL_GAP / 2;
  const y = grid.top + row * grid.cellHeight + CELL_GAP / 2;
  const width = grid.cellWidth - CELL_GAP;
  const height = grid.cellHeight - CELL_GAP;
  return `M${x},${y}h${width}v${height}h${-width}Z`;
}

/**
 * The step of the sequential palette a value falls in, from the first step (smallest) to the last.
 *
 * @param value - The value.
 * @param low - The smallest value.
 * @param high - The largest.
 * @param palette - The sequential palette.
 */
export function stepColor(
  value: number,
  low: number,
  high: number,
  palette: readonly string[],
): string {
  const share = high === low ? 1 : (value - low) / (high - low);
  const index = Math.min(palette.length - 1, Math.floor(share * palette.length));
  return palette[Math.max(0, index)] ?? '#000000';
}

/**
 * The sentence naming the highest cell for the summary, empty when there are no cells.
 *
 * @param cells - Every cell's value by its key.
 * @param write - Writes one value in the chart's format.
 */
function highestText(
  cells: ReadonlyMap<string, number | null>,
  write: (value: number) => string,
): string {
  const peak = [...cells.entries()].toSorted((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
  if (peak === undefined) {
    return '';
  }

  return ` Highest: ${keyNames(peak[0])} at ${write(peak[1] ?? 0)}.`;
}

/**
 * The column and the row a cell key stands for, written for a sentence: "Mon, Billing".
 *
 * @param key - A key from {@link cellKey}.
 */
function keyNames(key: string): string {
  const parsed: unknown = JSON.parse(key);
  return Array.isArray(parsed) ? parsed.join(', ') : key;
}

/**
 * A test for whether a cell is highlighted.
 *
 * @param highlight - The `highlight` prop.
 */
function outlinedCells(
  highlight: HeatmapProps['highlight'],
): (column: string, row: string) => boolean {
  const list = highlight === undefined ? [] : [highlight].flat();
  return (column, row) =>
    list.some(
      (entry) =>
        (entry.x === undefined || entry.x === column) && (entry.y === undefined || entry.y === row),
    );
}

/**
 * The scale legend in the top right: the palette's steps between two words.
 *
 * @param words - The words at the low and high ends.
 * @param context - The theme, measurer and chart width.
 */
function scaleLegend(
  words: readonly [string, string],
  context: { theme: ChartTheme; measure: DrawInput['measure']; width: number },
): SceneItem[] {
  const { theme, measure, width } = context;
  const style = theme.text.axis;
  const swatch = style.size;
  const swatchWidth = swatch - SWATCH_GAP;
  const palette = theme.sequential;
  const y = lineHeight(style) / 2;
  const highWidth = measure(words[1], style);
  let x = width - highWidth;
  const items: SceneItem[] = [
    { kind: 'text', x, y, lines: [words[1]], style, color: theme.colors.label, anchor: 'start' },
  ];
  x -= theme.space.sm + palette.length * swatch;
  for (const [index, color] of palette.entries()) {
    items.push({
      kind: 'path',
      d: `M${x + index * swatch},${y - swatch / 2}h${swatchWidth}v${swatch}h${-swatchWidth}Z`,
      fill: color,
    });
  }

  items.push({
    kind: 'text',
    x: x - theme.space.sm,
    y,
    lines: [words[0]],
    style,
    color: theme.colors.label,
    anchor: 'end',
  });
  return items;
}
