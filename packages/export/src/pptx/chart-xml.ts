import { strToU8, zipSync } from 'fflate';

import type {
  ChartFont,
  NativeAxis,
  NativeChartModel,
  NativeGroup,
  NativeMarker,
  NativeSeries,
} from '#pptx/chart-model.ts';
import type { SurfaceTheme } from '#pptx/theme.ts';

import { el, escapeXml, XML_DECLARATION } from '#ooxml/xml.ts';
import { CHART_NAMESPACE, PML_NAMESPACES } from '#pptx/namespaces.ts';
import { colorXml } from '#pptx/theme.ts';
import { fontSizeHundredths, pxToEmu } from '#units.ts';

/**
 * The axis ids the chart's two axes use.
 */
const AXIS_IDS = {
  /**
   * The category (or x) axis.
   */
  category: 111_111,

  /**
   * The value axis.
   */
  value: 222_222,
} as const;

/**
 * Spreadsheet column letters.
 */
const COLUMN_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * The workbook columns of a series: categories in column A and one column per series, or for a
 * scatter an x and a y column per series (split series have their own x values).
 *
 * @param scatter - Whether the chart is a scatter.
 * @param index - The series' chart-wide index.
 */
function seriesColumns(scatter: boolean, index: number): { x: string; y: string } {
  return scatter
    ? { x: columnLetter(index * 2), y: columnLetter(index * 2 + 1) }
    : { x: 'A', y: columnLetter(index + 1) };
}

/**
 * The letter of a spreadsheet column, two letters past Z.
 *
 * @param column - The zero-based column.
 */
function columnLetter(column: number): string {
  const size = COLUMN_LETTERS.length;
  if (column < size) {
    return COLUMN_LETTERS[column] ?? 'A';
  }

  const high = COLUMN_LETTERS[Math.floor(column / size) - 1] ?? 'A';
  const low = COLUMN_LETTERS[column % size] ?? 'A';
  return `${high}${low}`;
}

/**
 * Canvas pixels per point: the canvas is 1920 pixels across a 960-point slide.
 */
const PX_PER_PT = 2;

/**
 * The line width of a scatter's connecting line: 1.5 points, in EMU.
 */
const SCATTER_LINE_WIDTH_EMU = 19_050;

/**
 * Degrees in a full turn, which a doughnut's first slice angle wraps at.
 */
const DEGREES_PER_TURN = 360;

/**
 * The distance of category labels from their axis, as a percentage of the default.
 */
const CATEGORY_LABEL_OFFSET = 100;

/**
 * The number of decimal places a plot area's fraction keeps in the file.
 */
const FRACTION_DECIMALS = 5;

/**
 * The marker sizes DrawingML accepts, in points.
 */
const MARKER_SIZE_RANGE = {
  /**
   * The smallest.
   */
  min: 2,

  /**
   * The largest.
   */
  max: 72,
} as const;

/**
 * What the chart writer needs besides the chart: the slide's theme, for theme colors and fonts.
 */
export type ChartWriteContext = {
  /**
   * The theme of the slide's surface, or `null` to write plain colors and families.
   */
  theme: SurfaceTheme | null;
};

/**
 * A native chart part (`c:chartSpace`): its chart groups in the brand's colors with per-point
 * colors and markers, value labels with the web's exact text, the plot area laid out where the web
 * drew the plot, axes, gridlines and tick labels only where the web shows them, no legend unless
 * the model asks for one, no fill or line on the chart or plot area, and the data in an embedded
 * workbook so "Edit Data" works. Colors and fonts that match the theme are theme references.
 *
 * @param model - The native chart.
 * @param workbookId - The relationship id of the embedded workbook.
 * @param context - The slide's theme.
 * @returns The chart part's XML.
 */
export function chartXml(
  model: NativeChartModel,
  workbookId: string,
  context: ChartWriteContext,
): string {
  const doughnut = model.groups.some((group) => group.type === 'doughnut');
  let seriesIndex = 0;
  const groups = model.groups.map((group) => {
    const xml = groupXml(model, group, seriesIndex, context);
    seriesIndex += group.series.length;
    return xml;
  });
  const axes = doughnut ? '' : axesXml(model, context);
  const legend = legendXml(model.legend, context);
  return (
    XML_DECLARATION +
    el(
      'c:chartSpace',
      {
        'xmlns:c': CHART_NAMESPACE,
        'xmlns:a': PML_NAMESPACES['xmlns:a'],
        'xmlns:r': PML_NAMESPACES['xmlns:r'],
      },
      el('c:date1904', { val: 0 }),
      el('c:roundedCorners', { val: 0 }),
      el('c:style', { val: 2 }),
      el(
        'c:chart',
        {},
        el('c:autoTitleDeleted', { val: 1 }),
        el('c:plotArea', {}, layoutXml(model.plot), ...groups, axes, noFillXml()),
        legend,
        el('c:plotVisOnly', { val: 1 }),
        el('c:dispBlanksAs', { val: 'gap' }),
      ),
      noFillXml(),
      textProperties(model.font, context),
      el('c:externalData', { 'r:id': workbookId }, el('c:autoUpdate', { val: 0 })),
    )
  );
}

/**
 * The chart's legend at the bottom, or nothing when the model has none.
 *
 * @param legend - The legend, or `null`.
 * @param context - The slide's theme.
 */
function legendXml(legend: NativeChartModel['legend'], context: ChartWriteContext): string {
  if (legend === null) {
    return '';
  }

  return el(
    'c:legend',
    {},
    el('c:legendPos', { val: 'b' }),
    el('c:overlay', { val: 0 }),
    noFillXml(),
    textProperties(legend.font, context),
  );
}

/**
 * `c:spPr` with no fill and no outline.
 */
function noFillXml(): string {
  return el('c:spPr', {}, el('a:noFill'), el('a:ln', {}, el('a:noFill')));
}

/**
 * The plot area's manual layout: the inner plot where the web drew it, or automatic.
 *
 * @param plot - The inner plot as fractions of the chart frame, or `null`.
 */
function layoutXml(plot: NativeChartModel['plot']): string {
  if (plot === null) {
    return el('c:layout');
  }

  /**
   * A fraction rounded for the file.
   */
  const fraction = (value: number): number =>
    Number(Math.max(0, Math.min(1, value)).toFixed(FRACTION_DECIMALS));
  return el(
    'c:layout',
    {},
    el(
      'c:manualLayout',
      {},
      el('c:layoutTarget', { val: 'inner' }),
      el('c:xMode', { val: 'edge' }),
      el('c:yMode', { val: 'edge' }),
      el('c:x', { val: fraction(plot.x) }),
      el('c:y', { val: fraction(plot.y) }),
      el('c:w', { val: fraction(plot.width) }),
      el('c:h', { val: fraction(plot.height) }),
    ),
  );
}

/**
 * One chart group with its series.
 *
 * @param model - The chart.
 * @param group - The group.
 * @param firstIndex - The chart-wide index of the group's first series.
 * @param context - The slide's theme.
 */
function groupXml(
  model: NativeChartModel,
  group: NativeGroup,
  firstIndex: number,
  context: ChartWriteContext,
): string {
  const series = group.series
    .map((entry, offset) => seriesXml(model, group, entry, firstIndex + offset, context))
    .join('');
  const axisIds = el('c:axId', { val: AXIS_IDS.category }) + el('c:axId', { val: AXIS_IDS.value });
  switch (group.type) {
    case 'line': {
      return el(
        'c:lineChart',
        {},
        el('c:grouping', { val: 'standard' }),
        el('c:varyColors', { val: 0 }),
        series,
        el('c:marker', { val: 1 }),
        axisIds,
      );
    }

    case 'area': {
      return el(
        'c:areaChart',
        {},
        el('c:grouping', { val: group.grouping === 'stacked' ? 'stacked' : 'standard' }),
        el('c:varyColors', { val: 0 }),
        series,
        axisIds,
      );
    }

    case 'doughnut': {
      return el(
        'c:doughnutChart',
        {},
        el('c:varyColors', { val: 1 }),
        series,
        el('c:firstSliceAng', { val: Math.round(group.firstSliceAngle) % DEGREES_PER_TURN }),
        el('c:holeSize', { val: group.holeSize }),
      );
    }

    case 'scatter': {
      return el(
        'c:scatterChart',
        {},
        el('c:scatterStyle', { val: 'lineMarker' }),
        el('c:varyColors', { val: 0 }),
        series,
        axisIds,
      );
    }

    case 'bar': {
      return el(
        'c:barChart',
        {},
        el('c:barDir', { val: model.horizontal ? 'bar' : 'col' }),
        el('c:grouping', { val: group.grouping === 'standard' ? 'clustered' : group.grouping }),
        el('c:varyColors', { val: 0 }),
        series,
        el('c:gapWidth', { val: group.gapWidth }),
        group.overlap === 0 ? '' : el('c:overlap', { val: group.overlap }),
        axisIds,
      );
    }
  }
}

/**
 * One series: name, look, point colors and markers, value labels, categories and values, referring
 * to the embedded workbook with the values cached.
 *
 * @param model - The chart.
 * @param group - Its group.
 * @param series - The series.
 * @param index - Its chart-wide index.
 * @param context - The slide's theme.
 */
function seriesXml(
  model: NativeChartModel,
  group: NativeGroup,
  series: NativeSeries,
  index: number,
  context: ChartWriteContext,
): string {
  const columns = seriesColumns(group.type === 'scatter', index);
  const column = columns.y;
  const count = series.values.length;
  const name = seriesNameXml(series.name, column);
  const isLine = group.type === 'line' || group.type === 'scatter';
  const isBar = group.type === 'bar';
  const look = seriesLook(group, series, context);
  const marker = isLine
    ? markerXml(series.marker, context) || el('c:marker', {}, el('c:symbol', { val: 'none' }))
    : '';
  const points = pointsXml(group, series, context);
  const labels = labelsXml(group, series, context);
  const values = numberRef(
    `Sheet1!$${column}$2:$${column}$${count + 1}`,
    series.values,
    model.format,
  );
  const data = dataXml(group, model.categories, series, columns, values);
  const smooth = isLine ? el('c:smooth', { val: 0 }) : '';
  return el(
    'c:ser',
    {},
    el('c:idx', { val: index }),
    el('c:order', { val: index }),
    name,
    look,
    isBar ? el('c:invertIfNegative', { val: 0 }) : '',
    marker,
    points,
    labels,
    data,
    smooth,
  );
}

/**
 * A series' name: a string reference to its header cell in the workbook.
 *
 * @param name - The series' name.
 * @param column - The column the series' values are in.
 */
function seriesNameXml(name: string, column: string): string {
  return el(
    'c:tx',
    {},
    el(
      'c:strRef',
      {},
      el('c:f', {}, `Sheet1!$${column}$1`),
      el(
        'c:strCache',
        {},
        el('c:ptCount', { val: 1 }),
        el('c:pt', { idx: 0 }, el('c:v', {}, escapeXml(name))),
      ),
    ),
  );
}

/**
 * A series' data: its x and y values for a scatter, or its categories and values otherwise.
 *
 * @param group - Its group.
 * @param categories - The chart's categories.
 * @param series - The series.
 * @param columns - Its workbook columns.
 * @param values - The series' values, as their reference markup.
 */
function dataXml(
  group: NativeGroup,
  categories: readonly string[],
  series: NativeSeries,
  columns: { x: string; y: string },
  values: string,
): string {
  const count = series.values.length;
  if (group.type === 'scatter') {
    const xValues = numberRef(
      `Sheet1!$${columns.x}$2:$${columns.x}$${count + 1}`,
      series.x ?? [],
      'General',
    );
    return el('c:xVal', {}, xValues) + el('c:yVal', {}, values);
  }

  return categoryXml(categories, count) + el('c:val', {}, values);
}

/**
 * A series' fill or line.
 *
 * @param group - Its group.
 * @param series - The series.
 * @param context - The slide's theme.
 */
function seriesLook(group: NativeGroup, series: NativeSeries, context: ChartWriteContext): string {
  if (series.color === null) {
    return el('c:spPr', {}, el('a:noFill'), el('a:ln', {}, el('a:noFill')));
  }

  if (group.type === 'line') {
    return el(
      'c:spPr',
      {},
      el(
        'a:ln',
        { w: pxToEmu(series.lineWidth || 2), cap: 'rnd' },
        el('a:solidFill', {}, colorXml(series.color, context.theme)),
        el('a:round'),
      ),
    );
  }

  if (group.type === 'scatter') {
    return el('c:spPr', {}, el('a:ln', { w: SCATTER_LINE_WIDTH_EMU }, el('a:noFill')));
  }

  return el(
    'c:spPr',
    {},
    el('a:solidFill', {}, colorXml(series.color, context.theme)),
    sliceBorder(series, context),
  );
}

/**
 * A doughnut slice's border in the plate color, which draws the gaps between slices, or no line.
 *
 * @param series - The series.
 * @param context - The slide's theme.
 */
function sliceBorder(series: NativeSeries, context: ChartWriteContext): string {
  if (series.borderColor === null || series.lineWidth <= 0) {
    return el('a:ln', {}, el('a:noFill'));
  }

  return el(
    'a:ln',
    { w: pxToEmu(series.lineWidth) },
    el('a:solidFill', {}, colorXml(series.borderColor, context.theme)),
  );
}

/**
 * A marker, or nothing for none.
 *
 * @param marker - The marker.
 * @param context - The slide's theme.
 */
function markerXml(marker: NativeMarker | null, context: ChartWriteContext): string {
  if (marker === null) {
    return '';
  }

  const size = Math.round(
    Math.min(MARKER_SIZE_RANGE.max, Math.max(MARKER_SIZE_RANGE.min, marker.size / PX_PER_PT)),
  );
  const line =
    marker.line === null || marker.lineWidth <= 0
      ? el('a:ln', {}, el('a:noFill'))
      : el(
          'a:ln',
          { w: pxToEmu(marker.lineWidth) },
          el('a:solidFill', {}, colorXml(marker.line, context.theme)),
        );
  return el(
    'c:marker',
    {},
    el('c:symbol', { val: 'circle' }),
    el('c:size', { val: size }),
    el('c:spPr', {}, el('a:solidFill', {}, colorXml(marker.fill, context.theme)), line),
  );
}

/**
 * Per-point colors and markers.
 *
 * @param group - The group.
 * @param series - The series.
 * @param context - The slide's theme.
 */
function pointsXml(group: NativeGroup, series: NativeSeries, context: ChartWriteContext): string {
  const isLine = group.type === 'line' || group.type === 'scatter';
  const count = series.values.length;
  return Array.from({ length: count }, (_, point) => {
    const color = series.pointColors?.[point] ?? null;
    const marker = series.pointMarkers?.[point] ?? null;
    if (isLine && marker !== null) {
      return el(
        'c:dPt',
        {},
        el('c:idx', { val: point }),
        markerXml(marker, context),
        el('c:bubble3D', { val: 0 }),
      );
    }

    if (isLine || color === null || series.color === null) {
      return '';
    }

    return el(
      'c:dPt',
      {},
      el('c:idx', { val: point }),
      group.type === 'bar' ? el('c:invertIfNegative', { val: 0 }) : '',
      el('c:bubble3D', { val: 0 }),
      el(
        'c:spPr',
        {},
        el('a:solidFill', {}, colorXml(color, context.theme)),
        group.type === 'doughnut' ? sliceBorder(series, context) : el('a:ln', {}, el('a:noFill')),
      ),
    );
  }).join('');
}

/**
 * Value labels with the web's exact text, per point; points without a label have none.
 *
 * @param group - The group.
 * @param series - The series.
 * @param context - The slide's theme.
 */
function labelsXml(group: NativeGroup, series: NativeSeries, context: ChartWriteContext): string {
  if (series.labels.every((label) => label === null)) {
    return '';
  }

  const position = labelPosition(group.type);
  const labels = series.labels.map((label, point) =>
    pointLabelXml(label, point, position, context),
  );
  return el(
    'c:dLbls',
    {},
    ...labels,
    noFillXml(),
    ...(position === null ? [] : [el('c:dLblPos', { val: position })]),
    el('c:showLegendKey', { val: 0 }),
    el('c:showVal', { val: 0 }),
    el('c:showCatName', { val: 0 }),
    el('c:showSerName', { val: 0 }),
    el('c:showPercent', { val: 0 }),
    el('c:showBubbleSize', { val: 0 }),
  );
}

/**
 * Where a value label sits: a DrawingML position, or `null` for the chart's default.
 */
type LabelPosition = 'outEnd' | 't' | null;

/**
 * One point's label: its custom text, or a deleted label where the point has none.
 *
 * @param label - The point's label, or `null` for none.
 * @param point - The point's index.
 * @param position - Where the group's labels sit, or `null` for the default.
 * @param context - The slide's theme.
 */
function pointLabelXml(
  label: NativeSeries['labels'][number],
  point: number,
  position: LabelPosition,
  context: ChartWriteContext,
): string {
  if (label === null) {
    return el('c:dLbl', {}, el('c:idx', { val: point }), el('c:delete', { val: 1 }));
  }

  return el(
    'c:dLbl',
    {},
    el('c:idx', { val: point }),
    el(
      'c:tx',
      {},
      el(
        'c:rich',
        {},
        el('a:bodyPr', { rot: 0, vert: 'horz', wrap: 'none', anchor: 'ctr' }),
        el('a:lstStyle'),
        el(
          'a:p',
          {},
          el('a:pPr', {}, runProperties('a:defRPr', label.font, context)),
          el(
            'a:r',
            {},
            runProperties('a:rPr', label.font, context),
            el('a:t', {}, escapeXml(label.text)),
          ),
        ),
      ),
    ),
    noFillXml(),
    position === null ? '' : el('c:dLblPos', { val: position }),
    ...labelFlags(),
  );
}

/**
 * Where a group's value labels sit: past a bar's end, above a line's point, nowhere special in a
 * doughnut or an area.
 *
 * @param type - The chart type.
 */
function labelPosition(type: NativeGroup['type']): LabelPosition {
  if (type === 'bar') {
    return 'outEnd';
  }

  return type === 'line' || type === 'scatter' ? 't' : null;
}

/**
 * The show flags of a label with custom text: the value is shown, through the label's own text.
 */
function labelFlags(): string[] {
  return [
    el('c:showLegendKey', { val: 0 }),
    el('c:showVal', { val: 1 }),
    el('c:showCatName', { val: 0 }),
    el('c:showSerName', { val: 0 }),
    el('c:showPercent', { val: 0 }),
    el('c:showBubbleSize', { val: 0 }),
  ];
}

/**
 * The categories as a string reference with its cache.
 *
 * @param categories - The categories.
 * @param count - The number of values.
 */
function categoryXml(categories: readonly string[], count: number): string {
  const shown = categories.slice(0, count);
  return el(
    'c:cat',
    {},
    el(
      'c:strRef',
      {},
      el('c:f', {}, `Sheet1!$A$2:$A$${count + 1}`),
      el(
        'c:strCache',
        {},
        el('c:ptCount', { val: shown.length }),
        ...shown.map((category, index) =>
          el('c:pt', { idx: index }, el('c:v', {}, escapeXml(category))),
        ),
      ),
    ),
  );
}

/**
 * A numeric reference with its cache; `null` values are left out, so the chart shows a gap.
 *
 * @param formula - The workbook range.
 * @param values - The values.
 * @param format - The number format code.
 */
function numberRef(formula: string, values: readonly (number | null)[], format: string): string {
  const points = values.flatMap((value, index) =>
    value === null ? [] : [el('c:pt', { idx: index }, el('c:v', {}, String(value)))],
  );
  return el(
    'c:numRef',
    {},
    el('c:f', {}, formula),
    el(
      'c:numCache',
      {},
      el('c:formatCode', {}, escapeXml(format)),
      el('c:ptCount', { val: values.length }),
      ...points,
    ),
  );
}

/**
 * The category (or scatter x) axis and the value axis.
 *
 * @param model - The chart.
 * @param context - The slide's theme.
 */
function axesXml(model: NativeChartModel, context: ChartWriteContext): string {
  const scatter = model.groups.some((group) => group.type === 'scatter');
  const horizontal = model.horizontal;
  const category = model.categoryAxis;
  const value = model.valueAxis;
  if (category === null || value === null) {
    return '';
  }

  const categoryAxis = axisXml(scatter ? 'c:valAx' : 'c:catAx', category, {
    id: AXIS_IDS.category,
    cross: AXIS_IDS.value,
    position: horizontal ? 'l' : 'b',
    context,
    scatter,
    crossBetween: model.crossBetween,
    crossesMax: false,
  });
  const valueAxis = axisXml('c:valAx', value, {
    id: AXIS_IDS.value,
    cross: AXIS_IDS.category,
    position: horizontal ? 'b' : 'l',
    context,
    scatter,
    crossBetween: model.crossBetween,
    crossesMax: horizontal && category.reversed,
  });
  return categoryAxis + valueAxis;
}

/**
 * One axis.
 *
 * @param tag - `c:catAx` or `c:valAx`.
 * @param axis - The axis.
 * @param options - Its id, the axis it crosses, where it sits, the theme and how it crosses.
 * @param options.id - The axis id.
 * @param options.cross - The id of the axis it crosses.
 * @param options.position - `b`, `l`, ...
 * @param options.context - The slide's theme.
 * @param options.scatter - Whether the chart is a scatter.
 * @param options.crossBetween - Where lines put their first point.
 * @param options.crossesMax - Whether it crosses the other axis at its maximum.
 */
function axisXml(
  tag: 'c:catAx' | 'c:valAx',
  axis: NativeAxis,
  options: {
    id: number;
    cross: number;
    position: string;
    context: ChartWriteContext;
    scatter: boolean;
    crossBetween: 'between' | 'midCat';
    crossesMax: boolean;
  },
): string {
  const { context } = options;
  const scaling = el(
    'c:scaling',
    {},
    el('c:orientation', { val: axis.reversed ? 'maxMin' : 'minMax' }),
    axis.max === null ? '' : el('c:max', { val: axis.max }),
    axis.min === null ? '' : el('c:min', { val: axis.min }),
  );
  const line = axisLineXml(axis, context);
  const gridlines = gridlinesXml(axis, context);
  const isValue = tag === 'c:valAx';
  const format = axis.labels?.format ?? 'General';
  const labels = axis.labels;
  const text = labels === null ? '' : textProperties(labels.font, context, { rotation: true });
  const crossBetween = options.scatter ? 'midCat' : options.crossBetween;
  return el(
    tag,
    {},
    el('c:axId', { val: options.id }),
    scaling,
    el('c:delete', { val: 0 }),
    el('c:axPos', { val: options.position }),
    gridlines,
    isValue ? el('c:numFmt', { formatCode: format, sourceLinked: 0 }) : '',
    el('c:majorTickMark', { val: 'none' }),
    el('c:minorTickMark', { val: 'none' }),
    el('c:tickLblPos', { val: labels === null ? 'none' : 'nextTo' }),
    line,
    text,
    el('c:crossAx', { val: options.cross }),
    el('c:crosses', { val: options.crossesMax ? 'max' : 'autoZero' }),
    isValue ? el('c:crossBetween', { val: crossBetween }) : el('c:auto', { val: 1 }),
    isValue && axis.majorUnit !== null ? el('c:majorUnit', { val: axis.majorUnit }) : '',
    isValue ? '' : el('c:lblAlgn', { val: 'ctr' }),
    isValue ? '' : el('c:lblOffset', { val: CATEGORY_LABEL_OFFSET }),
    isValue ? '' : el('c:noMultiLvlLbl', { val: 0 }),
  );
}

/**
 * An axis line: none, or the axis's own line in its color and width.
 *
 * @param axis - The axis.
 * @param context - The slide's theme.
 */
function axisLineXml(axis: NativeAxis, context: ChartWriteContext): string {
  if (axis.line === null) {
    return el('c:spPr', {}, el('a:noFill'), el('a:ln', {}, el('a:noFill')));
  }

  return el(
    'c:spPr',
    {},
    el('a:noFill'),
    el(
      'a:ln',
      { w: pxToEmu(axis.line.width) },
      el('a:solidFill', {}, colorXml(axis.line.color, context.theme)),
    ),
  );
}

/**
 * The major gridlines of an axis, or nothing when it has none.
 *
 * @param axis - The axis.
 * @param context - The slide's theme.
 */
function gridlinesXml(axis: NativeAxis, context: ChartWriteContext): string {
  if (axis.gridlines === null) {
    return '';
  }

  return el(
    'c:majorGridlines',
    {},
    el(
      'c:spPr',
      {},
      el(
        'a:ln',
        { w: pxToEmu(axis.gridlines.width) },
        el('a:solidFill', {}, colorXml(axis.gridlines.color, context.theme)),
      ),
    ),
  );
}

/**
 * `c:txPr`: the font, size and color of chart text, with rotation fixed at 0 for axis labels so
 * renderers do not tilt them.
 *
 * @param font - The font.
 * @param context - The slide's theme.
 * @param options - Whether to fix the rotation.
 * @param options.rotation - Fix it at 0.
 */
function textProperties(
  font: ChartFont,
  context: ChartWriteContext,
  options: { rotation?: boolean } = {},
): string {
  return el(
    'c:txPr',
    {},
    el(
      'a:bodyPr',
      options.rotation === true ? { rot: 0, spcFirstLastPara: 1, vert: 'horz', wrap: 'none' } : {},
    ),
    el('a:lstStyle'),
    el(
      'a:p',
      {},
      el('a:pPr', {}, runProperties('a:defRPr', font, context)),
      el('a:endParaRPr', { lang: 'en-US' }),
    ),
  );
}

/**
 * Run properties for chart text: size, weight, color and typeface (a theme font reference where the
 * family is the theme's).
 *
 * @param tag - `a:defRPr` or `a:rPr`.
 * @param font - The font.
 * @param context - The slide's theme.
 */
function runProperties(tag: string, font: ChartFont, context: ChartWriteContext): string {
  return el(
    tag,
    {
      lang: tag === 'a:rPr' ? 'en-US' : undefined,
      sz: fontSizeHundredths(font.size),
      b: font.bold ? 1 : 0,
    },
    el('a:solidFill', {}, colorXml(font.color, context.theme)),
    font.family === '' && context.theme === null
      ? ''
      : el('a:latin', { typeface: chartTypeface(font.family, context) }),
  );
}

/**
 * The typeface of chart text: the theme's body or heading font reference when the family is one of
 * them (or unknown), else the family.
 *
 * @param family - The family the web used.
 * @param context - The slide's theme.
 */
export function chartTypeface(family: string, context: ChartWriteContext): string {
  const fonts = context.theme?.fonts;
  if (fonts === undefined) {
    return family;
  }

  if (family === '' || family === fonts.minor) {
    return '+mn-lt';
  }

  return family === fonts.major ? '+mj-lt' : family;
}

/**
 * The embedded workbook of a chart: categories (or scatter x values) in column A, one column per
 * series in chart order, names in row 1.
 *
 * @param model - The chart.
 * @returns The `.xlsx` bytes.
 */
export function chartWorkbook(model: NativeChartModel): Uint8Array {
  const series = model.groups.flatMap((group) => group.series);
  const isScatter = model.groups.some((group) => group.type === 'scatter');
  const rowCount = Math.max(model.categories.length, ...series.map((entry) => entry.values.length));
  return zipSync({
    '[Content_Types].xml': strToU8(contentTypesXml()),
    '_rels/.rels': strToU8(
      relationshipsXml(
        'xl/workbook.xml',
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
      ),
    ),
    'xl/workbook.xml': strToU8(workbookXml()),
    'xl/_rels/workbook.xml.rels': strToU8(
      relationshipsXml(
        'worksheets/sheet1.xml',
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet',
      ),
    ),
    'xl/worksheets/sheet1.xml': strToU8(worksheetXml(model, series, isScatter, rowCount)),
  });
}

/**
 * One worksheet cell: a number, inline text, or nothing for a gap.
 *
 * @param reference - The cell's reference, such as `B2`.
 * @param value - The cell's value, or `null` for a gap.
 */
function workbookCell(reference: string, value: string | number | null): string {
  if (value === null) {
    return '';
  }

  return typeof value === 'number'
    ? el('c', { r: reference }, el('v', {}, String(value)))
    : el('c', { r: reference, t: 'inlineStr' }, el('is', {}, el('t', {}, escapeXml(value))));
}

/**
 * The cells of one row: each series' value, and its x for a scatter; the header row when `row` is
 * `null`, which names each series.
 *
 * @param series - The chart's series, in chart order.
 * @param isScatter - Whether the chart is a scatter.
 * @param row - The zero-based data row, or `null` for the header.
 */
function workbookRowCells(
  series: readonly NativeSeries[],
  isScatter: boolean,
  row: number | null,
): string[] {
  return series.flatMap((entry, index) => {
    const columns = seriesColumns(isScatter, index);
    const number = row === null ? 1 : row + 2;
    const value = row === null ? entry.name : (entry.values[row] ?? null);
    if (!isScatter) {
      return [workbookCell(`${columns.y}${number}`, value)];
    }

    const x = row === null ? `${entry.name} x` : (entry.x?.[row] ?? null);
    return [workbookCell(`${columns.x}${number}`, x), workbookCell(`${columns.y}${number}`, value)];
  });
}

/**
 * The worksheet: a header row naming the series, then one row per category or value.
 *
 * @param model - The chart.
 * @param series - The chart's series, in chart order.
 * @param isScatter - Whether the chart is a scatter.
 * @param rowCount - How many data rows there are.
 */
function worksheetXml(
  model: NativeChartModel,
  series: readonly NativeSeries[],
  isScatter: boolean,
  rowCount: number,
): string {
  const header = el(
    'row',
    { r: 1 },
    isScatter ? '' : workbookCell('A1', ''),
    ...workbookRowCells(series, isScatter, null),
  );
  const rows = Array.from({ length: rowCount }, (_, row) =>
    el(
      'row',
      { r: row + 2 },
      isScatter ? '' : workbookCell(`A${row + 2}`, model.categories[row] ?? null),
      ...workbookRowCells(series, isScatter, row),
    ),
  );
  return (
    XML_DECLARATION +
    el(
      'worksheet',
      { xmlns: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main' },
      el('sheetData', {}, header, ...rows),
    )
  );
}

/**
 * The workbook part: one sheet named `Sheet1`.
 */
function workbookXml(): string {
  return (
    XML_DECLARATION +
    el(
      'workbook',
      {
        xmlns: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
        'xmlns:r': PML_NAMESPACES['xmlns:r'],
      },
      el('sheets', {}, el('sheet', { name: 'Sheet1', sheetId: 1, 'r:id': 'rId1' })),
    )
  );
}

/**
 * The workbook's content types: the package defaults and the workbook and sheet parts.
 */
function contentTypesXml(): string {
  return (
    XML_DECLARATION +
    el(
      'Types',
      { xmlns: 'http://schemas.openxmlformats.org/package/2006/content-types' },
      el('Default', {
        Extension: 'rels',
        ContentType: 'application/vnd.openxmlformats-package.relationships+xml',
      }),
      el('Default', { Extension: 'xml', ContentType: 'application/xml' }),
      el('Override', {
        PartName: '/xl/workbook.xml',
        ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
      }),
      el('Override', {
        PartName: '/xl/worksheets/sheet1.xml',
        ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml',
      }),
    )
  );
}

/**
 * A relationships part with one relationship, `rId1`.
 *
 * @param target - The relationship's target.
 * @param type - The relationship's type URI.
 */
function relationshipsXml(target: string, type: string): string {
  return (
    XML_DECLARATION +
    el(
      'Relationships',
      { xmlns: 'http://schemas.openxmlformats.org/package/2006/relationships' },
      el('Relationship', { Id: 'rId1', Type: type, Target: target }),
    )
  );
}
