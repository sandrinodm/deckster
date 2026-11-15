import type { ChartSpec } from '@deckster/kit/chart-spec';

import type { ExportMode } from '#plan/plan-scene.ts';
import type {
  ChartFont,
  ChartOverlay,
  ChartPlan,
  NativeAxis,
  NativeChartModel,
  NativeGroup,
  NativeLabel,
  NativeMarker,
  NativeSeries,
} from '#pptx/chart-model.ts';
import type { ChartSvg, ChartSvgItem } from '#pptx/chart-svg.ts';
import type { ChartNode, SceneRect, SlideScene, SvgNode } from '#scene/scene.ts';

import { readChartSvg } from '#pptx/chart-svg.ts';
import { maxOf, minOf } from '#units.ts';
import { pathBounds } from '#vector/svg-path.ts';

/**
 * The chart kinds a native PowerPoint chart can draw the same as the web.
 */
const NATIVE_KINDS = new Set<ChartSpec['kind']>([
  'bar',
  'line',
  'area',
  'donut',
  'scatter',
  'waterfall',
]);

/**
 * Figures without a plot to chart: the kit lays them out from text, shapes and small pictures,
 * which export as they are.
 */
const PART_KINDS = new Set<ChartSpec['kind']>([
  'big-number',
  'stat-row',
  'comparison',
  'progress',
  'table',
]);

/**
 * The chart kinds that are plain charts, not variants of one: a chart of another kind is noted as
 * drawn as a plain chart when it is drawn from its data alone.
 */
const PLAIN_KINDS = new Set<ChartSpec['kind']>(['bar', 'line', 'area', 'donut']);

/**
 * Why the other kinds stay pictures, for the dry-run report.
 */
const PICTURE_REASONS: Partial<Record<ChartSpec['kind'], string>> = {
  /**
   * A funnel's stages are centred bars with joins.
   */
  funnel: 'a funnel has no PowerPoint chart type (centred stages and joins)',

  /**
   * A slope chart labels both ends of every line.
   */
  slope: 'a slope chart has no PowerPoint chart type',

  /**
   * A heatmap is a grid of shaded cells.
   */
  heatmap: 'a heatmap has no PowerPoint chart type',

  /**
   * A sparkline has no axes, which a native line chart always draws space for.
   */
  sparkline: 'a sparkline is too small for a native chart without axis padding',

  /**
   * A pictogram repeats icons.
   */
  pictogram: 'a pictogram is a grid of icons',

  /**
   * Progress bars are drawn shapes.
   */
  progress: 'progress bars are drawn shapes',
};

/**
 * Positions closer than this many canvas pixels count as the same.
 */
const TOLERANCE_PX = 2;

/**
 * The largest error, in canvas pixels, between a mark and where the native chart would draw it.
 */
const FIT_TOLERANCE_PX = 1.5;

/**
 * The weight from which chart text is bold.
 */
const BOLD_WEIGHT = 600;

/**
 * Degrees in a turn.
 */
const FULL_TURN = 360;

/**
 * Percent per unit.
 */
const PERCENT = 100;

/**
 * The significant digits axis limits are rounded to, so they read cleanly.
 */
const AXIS_LIMIT_DIGITS = 6;

/**
 * Matches an SVG arc command whose radius starts with a non-zero digit: a rounded end of a bar.
 */
const ROUNDED_END_PATTERN = /A\s*[1-9]/;

/**
 * Matches a value as a number format writes it: an optional prefix, a sign (a hyphen or the
 * typographic minus), an integer with optional thousands commas, optional decimals and an optional
 * suffix.
 */
const FORMATTED_NUMBER_PATTERN =
  /^([^\d−-]*?)([−-]?)([^\d]*?)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?([^\d]*)$/;

/**
 * Matches a number format code that {@link formatWith} reads: an optional quoted prefix, `#,##0` or
 * `0`, optional decimals, thousands commas and an optional quoted suffix.
 */
const FORMAT_CODE_PATTERN = /^(?:"([^"]*)")?(#,##0|0)(?:\.(0+))?(,*)(?:"([^"]*)")?$/;

/**
 * The most parents {@link isInside} follows before it gives up, so a broken tree cannot loop
 * forever.
 */
const MAX_ANCESTOR_STEPS = 10_000;

/**
 * The font size, in canvas pixels, of chart text whose SVG names none.
 */
const DEFAULT_FONT_SIZE_PX = 24;

/**
 * The CSS weight of regular text, which chart text takes when its SVG names no weight.
 */
const REGULAR_FONT_WEIGHT = 400;

/**
 * The line width, in canvas pixels, of a line chart drawn from its data alone.
 */
const BASIC_LINE_WIDTH_PX = 3;

/**
 * The diameter, in canvas pixels, of the markers of a scatter drawn from its data alone.
 */
const BASIC_MARKER_SIZE_PX = 12;

/**
 * The gap between bar groups of a chart drawn from its data alone, in percent of a bar's width.
 */
const BASIC_GAP_WIDTH_PERCENT = 60;

/**
 * The hole of a doughnut drawn from its data alone, as a percentage of its diameter.
 */
const BASIC_HOLE_SIZE_PERCENT = 62;

/**
 * The widest gap between bar groups PowerPoint allows, in percent of a bar's width.
 */
const MAX_GAP_WIDTH_PERCENT = 500;

/**
 * The smallest hole a fitted doughnut is given, as a percentage of its diameter.
 */
const MIN_HOLE_SIZE_PERCENT = 10;

/**
 * The largest hole a fitted doughnut is given, as a percentage of its diameter.
 */
const MAX_HOLE_SIZE_PERCENT = 90;

/**
 * The gap between two slices, in degrees, above which a doughnut draws a plate-coloured border
 * between them.
 */
const MIN_VISIBLE_SLICE_GAP_DEG = 0.05;

/**
 * The most two radii of an SVG arc may differ, in the SVG's user units, and still be a circle.
 */
const ARC_RADIUS_TOLERANCE = 0.01;

/**
 * A number in an SVG path, as a capture group.
 */
const ARC_NUMBER = String.raw`([-\d.e]+)`;

/**
 * The whitespace or comma between two numbers of an SVG path.
 */
const ARC_SEPARATOR = String.raw`[\s,]+`;

/**
 * Matches an SVG path that is one circular arc: its start point, radii, rotation, flags and end.
 */
const ARC_PATH_PATTERN = new RegExp(
  String.raw`^M\s*${ARC_NUMBER}${ARC_SEPARATOR}${ARC_NUMBER}\s*A\s*` +
    String.raw`${ARC_NUMBER}${ARC_SEPARATOR}${ARC_NUMBER}${ARC_SEPARATOR}` +
    String.raw`${ARC_NUMBER}${ARC_SEPARATOR}([01])[\s,]*([01])[\s,]*` +
    String.raw`${ARC_NUMBER}${ARC_SEPARATOR}${ARC_NUMBER}\s*$`,
  'i',
);

/**
 * The score a path gets for a color that differs from the series' color. It outweighs any fit
 * error, so a path of the right color always wins.
 */
const COLOR_MISMATCH_SCORE = 1000;

/**
 * The score a path gets when its heights do not fit a series' values at all.
 */
const UNFITTED_PATH_SCORE = 500;

/**
 * The points an area has besides its series' points: its two base corners.
 */
const AREA_BASE_CORNERS = 2;

/**
 * Half of a category's band, in category units: the distance from a category's centre to its edge.
 */
const HALF_CATEGORY = 0.5;

/**
 * How far from a bar's end, in font sizes, a value label may sit and still be its outside-end
 * label.
 */
const OUTSIDE_LABEL_REACH_SIZES = 3;

/**
 * Horizontal bars allow a value label three times the reach of a vertical bar's label, because the
 * label runs along the bar's length.
 */
const HORIZONTAL_LABEL_REACH_FACTOR = 3;

/**
 * How far below the plot, in font sizes, a scatter's x tick label may sit.
 */
const TICK_LABEL_REACH_SIZES = 3;

/**
 * How far a tick may sit from an even ladder of ticks, as a share of one tick step, and still count
 * as on it.
 */
const TICK_TOLERANCE_RATIO = 1e-6;

/**
 * How far a total may differ from the running total, as a share of the running total, and still be
 * a waterfall's total bar.
 */
const TOTAL_TOLERANCE_RATIO = 1e-9;

/**
 * How far a value may differ from a number format's scale, as a share of the scale, and still be
 * written by it.
 */
const SCALE_TOLERANCE = 0.051;

/**
 * The scales a number format can write: units, thousands, millions and billions.
 */
const FORMAT_SCALES = [1, 1e3, 1e6, 1e9] as const;

/**
 * The factor one thousands separator in a number format stands for.
 */
const THOUSAND = 1000;

/**
 * The power of ten one thousands separator stands for: a factor of a thousand is ten to the third.
 */
const LOG10_PER_THOUSAND = 3;

/**
 * A box thinner than this in both directions, in the SVG's units, has no extent worth drawing.
 */
const NEGLIGIBLE_EXTENT = 0.01;

/**
 * A line whose ends differ by less than this in the SVG's units is flat.
 */
const FLAT_LINE_TOLERANCE = 0.5;

/**
 * Hex digits per colour channel in `#rrggbb`.
 */
const CHANNEL_HEX_DIGITS = 2;

/**
 * Where the red, green and blue channels start in `#rrggbb`, after the `#`.
 */
const RGB_CHANNEL_STARTS = [1, 3, 5] as const;

/**
 * Two colors whose channels differ by at most this much are the same color.
 */
const SAME_RGB_TOLERANCE = 2;

/**
 * The diameter of a scatter's dot, in canvas pixels, when its drawn dot cannot be found.
 */
const DEFAULT_MARKER_SIZE_PX = 8;

/**
 * Decides how a kit chart is exported. In `hybrid` mode it is a native chart only when the native
 * chart draws the same thing: the kind has a native equivalent (bars, columns, stacked bars, a
 * waterfall as stacked bars on an invisible base, lines, areas, a doughnut, a scatter), every mark
 * of the web's SVG is found where a native chart with the measured plot area would draw it, and
 * what the native chart cannot draw (direct labels, centre text, annotations, legends drawn in the
 * plot, connectors, highlighted category labels) is reproduced by overlay shapes from the SVG.
 * Otherwise the plot is a picture (SVG with a PNG fallback). In `native` mode a chart with a native
 * type is always native; what differs from the web is reported as `simplified`.
 *
 * @param node - The chart.
 * @param scene - The slide's scene, for the chart's plot SVG.
 * @param mode - The export mode.
 * @returns The plan; never fails.
 */
export function planChart(
  node: ChartNode,
  scene: Pick<SlideScene, 'nodes' | 'tree'>,
  mode: ExportMode,
): ChartPlan {
  const spec = node.chart;
  const plot = plotSvg(node, scene);
  const basic = spec.native !== null && spec.native !== 'table' && spec.series.length > 0;
  /**
   * The plan when the chart is not equivalent: forced native in `native` mode, else a picture.
   */
  const fallback = (why: string): ChartPlan =>
    mode === 'native' && basic ? basicFallback(spec, plot, why) : pictureFallback(mode, why);

  if (PART_KINDS.has(spec.kind)) {
    return partsPlan(spec.kind);
  }

  if (!NATIVE_KINDS.has(spec.kind)) {
    return fallback(PICTURE_REASONS[spec.kind] ?? `a ${spec.kind} has no PowerPoint chart type`);
  }

  if (plot === null) {
    return fallback('the chart has no plot SVG to measure');
  }

  const svg = readChartSvg(plot.markup, plot.rect);
  const fitted = fitChart(spec, svg);
  if (typeof fitted === 'string') {
    return fallback(`a native chart would not match the web (${fitted})`);
  }

  return {
    outcome: fitted.changes.length === 0 ? 'native' : 'simplified',
    model: fitted.model,
    overlays: fitted.overlays,
    plotId: plot.id,
    reasons: fitted.reasons,
    changes: fitted.changes,
  };
}

/**
 * The plan for a figure the kit lays out from its text and shapes: nothing is drawn as a chart, and
 * its parts stay native.
 *
 * @param kind - The figure's kind.
 */
function partsPlan(kind: ChartSpec['kind']): ChartPlan {
  return {
    outcome: 'parts',
    model: null,
    overlays: [],
    plotId: null,
    reasons: [
      kind === 'table'
        ? 'a native table'
        : `a ${kind} is drawn from its text and shapes, small SVGs as pictures`,
    ],
    changes: [],
  };
}

/**
 * The plan in `native` mode for a chart that is not equivalent but has a native type: the chart
 * drawn from its data, with what it loses listed as changes.
 *
 * @param spec - The chart's description.
 * @param plot - The chart's plot SVG, if it has one.
 * @param why - Why the chart is not equivalent.
 */
function basicFallback(spec: ChartSpec, plot: SvgNode | null, why: string): ChartPlan {
  return {
    outcome: 'simplified',
    model: basicModel(spec),
    overlays: [],
    plotId: plot?.id ?? null,
    reasons: [`native ${spec.native ?? ''} chart from the data; ${why}`],
    changes: lostByBasicModel(spec),
  };
}

/**
 * The plan for a chart that stays a picture: the plot SVG with a PNG fallback, or nothing in
 * `native` mode, which draws no pictures.
 *
 * @param mode - The export mode.
 * @param why - Why the chart is not a native chart.
 */
function pictureFallback(mode: ExportMode, why: string): ChartPlan {
  return {
    outcome: 'picture',
    model: null,
    overlays: [],
    plotId: null,
    reasons: [
      mode === 'native'
        ? `${why}; native mode draws no pictures, so the plot is left out`
        : `${why}; the plot is a picture (SVG with a PNG fallback)`,
    ],
    changes: [],
  };
}

/**
 * The chart's plot: its largest SVG.
 *
 * @param node - The chart.
 * @param scene - The scene.
 */
export function plotSvg(
  node: ChartNode,
  scene: Pick<SlideScene, 'nodes' | 'tree'>,
): SvgNode | null {
  const svgs = scene.nodes.filter(
    (candidate): candidate is SvgNode =>
      candidate.kind === 'svg' && isInside(candidate.parent, node.id, scene),
  );
  const largest = svgs.sort(
    (a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height,
  )[0];
  return largest ?? null;
}

/**
 * Whether an element id is, or is inside, another.
 *
 * @param id - The element id to start from.
 * @param ancestor - The ancestor's id.
 * @param scene - The scene's element tree.
 */
function isInside(
  id: number | null,
  ancestor: number,
  scene: Pick<SlideScene, 'nodes' | 'tree'>,
): boolean {
  for (let current = id, steps = 0; current !== null && steps < MAX_ANCESTOR_STEPS; steps += 1) {
    if (current === ancestor) {
      return true;
    }

    const parent = scene.tree[String(current)];
    current =
      parent === undefined
        ? (scene.nodes.find((candidate) => candidate.id === current)?.parent ?? null)
        : parent;
  }

  return false;
}

/**
 * A fitted native chart with its overlays and notes.
 */
type Fitted = {
  /**
   * The native chart.
   */
  model: NativeChartModel;

  /**
   * What is drawn over or under it.
   */
  overlays: ChartOverlay[];

  /**
   * Notes for the report.
   */
  reasons: string[];

  /**
   * Visible differences from the web.
   */
  changes: string[];
};

/**
 * Fits a native chart to the web's SVG.
 *
 * @param spec - The chart's description.
 * @param svg - The plot SVG.
 * @returns The chart, or why it does not match.
 */
function fitChart(spec: ChartSpec, svg: ChartSvg): Fitted | string {
  if (svg.items.length === 0) {
    return 'its SVG could not be read';
  }

  switch (spec.kind) {
    case 'bar':
    case 'waterfall': {
      return fitBars(spec, svg);
    }

    case 'line':
    case 'area': {
      return fitLines(spec, svg);
    }

    case 'donut': {
      return fitDoughnut(spec, svg);
    }

    case 'scatter': {
      return fitScatter(spec, svg);
    }

    case 'slope':
    case 'funnel':
    case 'heatmap':
    case 'sparkline':
    case 'big-number':
    case 'stat-row':
    case 'comparison':
    case 'progress':
    case 'pictogram':
    case 'table': {
      return `${spec.kind} is not drawn natively`;
    }
  }
}

/**
 * A linear map from values to canvas pixels along one axis.
 */
type LinearMap = {
  /**
   * The pixel position of 0.
   */
  a: number;

  /**
   * Pixels per unit.
   */
  b: number;

  /**
   * The largest error of the fitted points, in pixels.
   */
  error: number;
};

/**
 * A least-squares line through value and pixel pairs.
 *
 * @param pairs - `[value, pixel]` pairs.
 * @returns The map, or `null` when the values do not vary.
 */
export function fitLinear(pairs: readonly (readonly [number, number])[]): LinearMap | null {
  const count = pairs.length;
  if (count < 2) {
    return null;
  }

  const meanValue = pairs.reduce((sum, [value]) => sum + value, 0) / count;
  const meanPixel = pairs.reduce((sum, [, pixel]) => sum + pixel, 0) / count;
  const spread = pairs.reduce((sum, [value]) => sum + (value - meanValue) ** 2, 0);
  if (spread === 0) {
    return null;
  }

  const b =
    pairs.reduce((sum, [value, pixel]) => sum + (value - meanValue) * (pixel - meanPixel), 0) /
    spread;
  const a = meanPixel - b * meanValue;
  const error = maxOf(pairs.map(([value, pixel]) => Math.abs(a + b * value - pixel)));
  return { a, b, error };
}

/**
 * Whether a fitted line exists and its largest error is within {@link FIT_TOLERANCE_PX}. A NaN
 * error passes, since `NaN > tolerance` is false.
 *
 * @param map - The fitted line, or `null` when the values did not fit one.
 */
function fitsWithinTolerance(map: LinearMap | null): map is LinearMap {
  return map !== null && !(map.error > FIT_TOLERANCE_PX);
}

/**
 * A bar the spec says the chart draws: its series, category and value extent.
 */
type ExpectedBar = {
  /**
   * The series index.
   */
  series: number;

  /**
   * The category index.
   */
  category: number;

  /**
   * The value the bar starts at.
   */
  lo: number;

  /**
   * The value the bar ends at.
   */
  hi: number;
};

/**
 * The bars a bar chart or waterfall draws, by category, in stacking or series order.
 *
 * @param spec - The chart.
 */
export function expectedBars(spec: ChartSpec): ExpectedBar[] {
  const bars: ExpectedBar[] = [];
  if (spec.kind === 'waterfall') {
    const values = spec.series[0]?.values ?? [];
    let running = 0;
    values.forEach((value, category) => {
      if (value === null) {
        return;
      }

      const isTotal =
        category === 0 || Math.abs(value - running) < TOTAL_TOLERANCE_RATIO * Math.max(1, running);
      if (isTotal) {
        bars.push({ series: 0, category, lo: Math.min(0, value), hi: Math.max(0, value) });
        running = value;
      } else {
        bars.push({
          series: 0,
          category,
          lo: Math.min(running, running + value),
          hi: Math.max(running, running + value),
        });
        running += value;
      }
    });
    return bars;
  }

  spec.categories.forEach((_, category) => {
    let positive = 0;
    let negative = 0;
    spec.series.forEach((series, index) => {
      const value = series.values[category] ?? null;
      if (value === null || value === 0) {
        return;
      }

      if (!spec.stacked) {
        bars.push({
          series: index,
          category,
          lo: Math.min(0, value),
          hi: Math.max(0, value),
        });
      } else if (value > 0) {
        bars.push({ series: index, category, lo: positive, hi: positive + value });
        positive += value;
      } else {
        bars.push({ series: index, category, lo: negative + value, hi: negative });
        negative += value;
      }
    });
  });
  return bars;
}

/**
 * A rectangle's extent along the category and value axes.
 */
type AxisBox = {
  /**
   * Start along the category axis.
   */
  c0: number;

  /**
   * End along the category axis.
   */
  c1: number;

  /**
   * Start along the value axis.
   */
  v0: number;

  /**
   * End along the value axis.
   */
  v1: number;
};

/**
 * Fits a bar chart (vertical or horizontal, grouped or stacked) or a waterfall.
 *
 * @param spec - The chart.
 * @param svg - The plot SVG.
 */
function fitBars(spec: ChartSpec, svg: ChartSvg): Fitted | string {
  const horizontal = spec.orientation === 'horizontal';
  const expected = expectedBars(spec);
  if (spec.kind === 'waterfall' && expected.some((bar) => bar.lo < 0)) {
    return 'the waterfall goes below zero, which stacked bars on an invisible base cannot draw';
  }

  const marks = svg.items.filter(
    (item) =>
      item.mark &&
      (item.tag === 'path' || item.tag === 'rect') &&
      item.fill !== null &&
      extent(item) !== null,
  );
  if (marks.length !== expected.length || marks.length === 0) {
    return `${marks.length} bars drawn, ${expected.length} expected`;
  }

  const counts = spec.categories.map(
    (_, category) => expected.filter((bar) => bar.category === category).length,
  );
  const seriesCount = maxOf(counts);
  if (horizontal && !spec.stacked && seriesCount > 1) {
    return 'grouped horizontal bars are not matched';
  }

  const assigned = assignBars(spec, marks, counts, expected, horizontal);
  const valueMap = fitLinear(barValuePairs(assigned, horizontal));
  if (!fitsWithinTolerance(valueMap)) {
    return 'bar heights do not follow one value scale';
  }

  const categories = fitBarCategories(spec, svg, assigned, horizontal, seriesCount);
  if (categories === null) {
    return 'bars are not evenly spaced';
  }

  const { map: categoryMap, thickness, span } = categories;
  const band = Math.abs(categoryMap.b);
  const { gapWidth, overlap } = barGaps(spec, { band, span, thickness }, seriesCount);
  const { plot, range } = barPlot(spec, expected, valueMap, categoryMap, band, horizontal);
  const geometry: PlotGeometry = {
    horizontal,
    plot,
    valueMap,
    categoryAt: (category) => categoryMap.a + categoryMap.b * category,
    range,
  };
  return barChart(spec, svg, {
    assigned,
    geometry,
    gapWidth,
    overlap,
    reversed: horizontal && categoryMap.b > 0,
  });
}

/**
 * A bar chart fitted to the drawn bars: which mark is which bar, where the plot sits and how the
 * bars are spaced.
 */
type BarFit = {
  /**
   * The mark of each expected bar.
   */
  assigned: ReadonlyMap<ChartSvgItem, ExpectedBar>;

  /**
   * Where the plot sits and how values and categories map to pixels.
   */
  geometry: PlotGeometry;

  /**
   * The gap between bar groups, in percent of a bar's width.
   */
  gapWidth: number;

  /**
   * How bars of one category overlap, in percent.
   */
  overlap: number;

  /**
   * Whether the category axis runs in reverse, which horizontal bars whose categories count upwards
   * need.
   */
  reversed: boolean;
};

/**
 * Builds the native bar chart of a fitted bar chart, with the overlays its marks do not cover.
 *
 * @param spec - The chart.
 * @param svg - The plot SVG.
 * @param fit - The fitted bars.
 */
function barChart(spec: ChartSpec, svg: ChartSvg, fit: BarFit): Fitted {
  const { assigned, geometry, gapWidth, overlap } = fit;
  const waterfall = spec.kind === 'waterfall';
  const consumed = new Set<ChartSvgItem>(assigned.keys());
  const reasons: string[] = [];
  const changes: string[] = [];
  const seriesList = waterfall
    ? waterfallSeries(spec, assigned)
    : barSeries(spec, assigned, geometry.horizontal, consumed, svg, changes);
  const axes = readAxes(spec, svg, geometry, consumed);
  reasons.push(...axes.reasons);
  const group: NativeGroup = {
    type: 'bar',
    grouping: spec.stacked || waterfall ? 'stacked' : 'clustered',
    series: seriesList,
    gapWidth,
    overlap,
    holeSize: 0,
    firstSliceAngle: 0,
  };
  if (waterfall) {
    reasons.push('waterfall as stacked bars on an invisible base; connectors and labels as shapes');
  }

  return finish(spec, svg, consumed, reasons, changes, {
    name: spec.name,
    groups: [group],
    categories: [...spec.categories],
    horizontal: geometry.horizontal,
    crossBetween: 'between',
    plot: fractions(geometry.plot, svg.rect),
    categoryAxis: { ...axes.category, reversed: fit.reversed },
    valueAxis: axes.value,
    legend: null,
    format: axes.format ?? spec.format.excel,
    font: commonFont(svg),
  });
}

/**
 * A mark's box along the chart's category and value axes.
 *
 * @param item - The mark.
 * @param horizontal - Whether bars run horizontally.
 */
function axisBox(item: ChartSvgItem, horizontal: boolean): AxisBox {
  const bounds = extent(item) ?? { x: 0, y: 0, width: 0, height: 0 };
  return horizontal
    ? { c0: bounds.y, c1: bounds.y + bounds.height, v0: bounds.x, v1: bounds.x + bounds.width }
    : { c0: bounds.x, c1: bounds.x + bounds.width, v0: bounds.y, v1: bounds.y + bounds.height };
}

/**
 * Pairs each drawn mark with the expected bar it draws. Marks are split into categories by their
 * position along the category axis; within a category, a stacked chart pairs them from the base of
 * the stack outwards, and any other chart pairs them in series order.
 *
 * @param spec - The chart.
 * @param marks - The drawn bars.
 * @param counts - The number of bars each category has.
 * @param expected - The bars the spec says the chart draws.
 * @param horizontal - Whether bars run horizontally.
 */
function assignBars(
  spec: ChartSpec,
  marks: readonly ChartSvgItem[],
  counts: readonly number[],
  expected: readonly ExpectedBar[],
  horizontal: boolean,
): Map<ChartSvgItem, ExpectedBar> {
  const sorted = [...marks].sort(
    (a, b) => center(axisBox(a, horizontal)) - center(axisBox(b, horizontal)),
  );
  const assigned = new Map<ChartSvgItem, ExpectedBar>();
  const stacked = spec.stacked && spec.kind !== 'waterfall';
  let cursor = 0;
  for (const [category, count] of counts.entries()) {
    const group = sorted.slice(cursor, cursor + count);
    cursor += count;
    const bars = expected.filter((bar) => bar.category === category);
    const ordered = stacked ? [...group].sort((a, b) => stackOrder(a, b, horizontal)) : group;
    const orderedBars = stacked ? [...bars].sort((a, b) => a.lo - b.lo) : bars;
    ordered.forEach((item, index) => {
      const bar = orderedBars[index];
      if (bar !== undefined) {
        assigned.set(item, bar);
      }
    });
  }

  return assigned;
}

/**
 * Orders two marks of a stacked chart from the base of the stack outwards: left to right for
 * horizontal bars, bottom to top for vertical ones.
 *
 * @param a - A mark.
 * @param b - Another mark.
 * @param horizontal - Whether bars run horizontally.
 */
function stackOrder(a: ChartSvgItem, b: ChartSvgItem, horizontal: boolean): number {
  if (horizontal) {
    return axisBox(a, true).v0 - axisBox(b, true).v0;
  }

  return axisBox(b, false).v1 - axisBox(a, false).v1;
}

/**
 * The value-to-pixel pairs of the drawn bars: each bar's two values against the two edges of its
 * mark along the value axis.
 *
 * @param assigned - The mark of each expected bar.
 * @param horizontal - Whether bars run horizontally.
 */
function barValuePairs(
  assigned: ReadonlyMap<ChartSvgItem, ExpectedBar>,
  horizontal: boolean,
): [number, number][] {
  const valuePairs: [number, number][] = [];
  for (const [item, bar] of assigned) {
    const edges = axisBox(item, horizontal);
    if (horizontal) {
      valuePairs.push([bar.lo, edges.v0], [bar.hi, edges.v1]);
    } else {
      valuePairs.push([bar.lo, edges.v1], [bar.hi, edges.v0]);
    }
  }

  return valuePairs;
}

/**
 * How the categories of a bar chart sit on the category axis, fitted to the drawn bars.
 */
type BarCategories = {
  /**
   * Category index to pixel along the category axis.
   */
  map: LinearMap;

  /**
   * The thickness of one bar along the category axis, in pixels.
   */
  thickness: number;

  /**
   * The length the fullest category group takes along the category axis, in pixels.
   */
  span: number;
};

/**
 * Fits the categories of a bar chart to the centres of their drawn bars. A chart with one category
 * and one series has a single centre, so its scale comes from the size of the plot instead.
 *
 * @param spec - The chart.
 * @param svg - The plot SVG.
 * @param assigned - The mark of each expected bar.
 * @param horizontal - Whether bars run horizontally.
 * @param seriesCount - The most bars any category has.
 * @returns The fit, or `null` when the centres do not follow one even scale.
 */
function fitBarCategories(
  spec: ChartSpec,
  svg: ChartSvg,
  assigned: ReadonlyMap<ChartSvgItem, ExpectedBar>,
  horizontal: boolean,
  seriesCount: number,
): BarCategories | null {
  const groups = spec.categories.map((_, category) =>
    [...assigned]
      .filter(([, bar]) => bar.category === category)
      .map(([item]) => axisBox(item, horizontal)),
  );
  const centers = groups.flatMap((group, category) =>
    group.length === 0
      ? []
      : [
          [
            category,
            (minOf(group.map((part) => part.c0)) + maxOf(group.map((part) => part.c1))) / 2,
          ] as const,
        ],
  );
  const thickness =
    [...assigned.keys()].reduce(
      (sum, item) => sum + (axisBox(item, horizontal).c1 - axisBox(item, horizontal).c0),
      0,
    ) / assigned.size;
  const categoryMap = fitLinear(centers) ?? singleCategoryMap(spec, svg, centers, horizontal);
  if (!fitsWithinTolerance(categoryMap)) {
    return null;
  }

  const fullGroup = groups.find((group) => group.length === seriesCount) ?? [];
  const span =
    fullGroup.length === 0
      ? thickness
      : maxOf(fullGroup.map((part) => part.c1)) - minOf(fullGroup.map((part) => part.c0));
  return { map: categoryMap, thickness, span };
}

/**
 * The category scale of a chart with one category and one series, whose one centre cannot be
 * fitted: the category spans the whole plot, so one unit is the plot's size along that axis.
 *
 * @param spec - The chart.
 * @param svg - The plot SVG.
 * @param centers - The centres of the drawn categories.
 * @param horizontal - Whether bars run horizontally.
 */
function singleCategoryMap(
  spec: ChartSpec,
  svg: ChartSvg,
  centers: readonly (readonly [number, number])[],
  horizontal: boolean,
): LinearMap | null {
  if (centers.length !== 1 || spec.categories.length !== 1) {
    return null;
  }

  return { a: centers[0]?.[1] ?? 0, b: horizontal ? svg.rect.height : svg.rect.width, error: 0 };
}

/**
 * The gap between bar groups and the overlap of the bars within a category, in percent, as the
 * native chart spaces them.
 *
 * @param spec - The chart.
 * @param fit - The band of a category, the span of the fullest group and the thickness of a bar, in
 *   pixels.
 * @param seriesCount - The most bars any category has.
 */
function barGaps(
  spec: ChartSpec,
  fit: { band: number; span: number; thickness: number },
  seriesCount: number,
): { gapWidth: number; overlap: number } {
  const { band, span, thickness } = fit;
  const innerGap =
    spec.stacked || seriesCount < 2 ? 0 : (span - seriesCount * thickness) / (seriesCount - 1);
  const overlap =
    spec.stacked || spec.kind === 'waterfall'
      ? PERCENT
      : clamp(Math.round((-innerGap / thickness) * PERCENT), -PERCENT, PERCENT);
  const gapWidth = clamp(
    Math.round(((band - span) / thickness) * PERCENT),
    0,
    MAX_GAP_WIDTH_PERCENT,
  );
  return { gapWidth, overlap };
}

/**
 * The plot area of a bar chart and the value range it shows: the categories, one band each, and the
 * values of the axis widened to the drawn bars.
 *
 * @param spec - The chart.
 * @param expected - The bars the spec says the chart draws.
 * @param valueMap - Value to pixel along the value axis.
 * @param categoryMap - Category index to pixel along the category axis.
 * @param band - The pixels one category takes.
 * @param horizontal - Whether bars run horizontally.
 */
function barPlot(
  spec: ChartSpec,
  expected: readonly ExpectedBar[],
  valueMap: LinearMap,
  categoryMap: LinearMap,
  band: number,
  horizontal: boolean,
): { plot: SceneRect; range: { min: number; max: number } } {
  const range = valueRange(
    spec,
    expected.flatMap((bar) => [bar.lo, bar.hi]),
  );
  const categoryStart = categoryMap.a - band / 2;
  const categoryEnd = categoryMap.a + band * (spec.categories.length - HALF_CATEGORY);
  const valueStart = valueMap.a + valueMap.b * range.min;
  const valueEnd = valueMap.a + valueMap.b * range.max;
  const plot = horizontal
    ? rectFrom(valueStart, categoryStart, valueEnd, categoryEnd)
    : rectFrom(categoryStart, valueEnd, categoryEnd, valueStart);
  return { plot, range };
}

/**
 * The series of a bar chart: colors from the drawn bars and value labels where the native chart
 * puts them (centred just past the bar's end).
 *
 * @param spec - The chart.
 * @param assigned - The bars found for each expected bar.
 * @param horizontal - Whether bars run horizontally.
 * @param consumed - Collects the SVG items the native chart draws.
 * @param svg - The plot SVG.
 * @param changes - Collects visible differences.
 */
function barSeries(
  spec: ChartSpec,
  assigned: ReadonlyMap<ChartSvgItem, ExpectedBar>,
  horizontal: boolean,
  consumed: Set<ChartSvgItem>,
  svg: ChartSvg,
  changes: string[],
): NativeSeries[] {
  const nativeLabels = !spec.stacked;
  let rounded = false;
  const series = spec.series.map((source, index): NativeSeries => {
    const bars = [...assigned].filter(([, bar]) => bar.series === index);
    const colors = spec.categories.map(
      (_, category) => bars.find(([, bar]) => bar.category === category)?.[0].fill ?? null,
    );
    rounded ||= bars.some(([item]) => ROUNDED_END_PATTERN.test(item.attrs['d'] ?? ''));
    const labels = spec.categories.map((_, category): NativeLabel | null => {
      const text = source.labels[category] ?? null;
      const bar = bars.find(([, candidate]) => candidate.category === category);
      if (text === null || bar === undefined || !nativeLabels) {
        return null;
      }

      const bounds = extent(bar[0]);
      const found = svg.items.find(
        (item) =>
          !consumed.has(item) &&
          item.text !== null &&
          item.text.lines.join(' ') === text &&
          bounds !== null &&
          isOutsideEnd(item, bounds, horizontal, bar[1].hi > bar[1].lo && bar[1].hi > 0),
      );
      if (found === undefined || found.text === null) {
        return null;
      }

      consumed.add(found);
      return { text, font: fontOf(found) };
    });
    return seriesFrom(source.name, source.values, colors, labels);
  });
  if (rounded) {
    changes.push('bar ends are square, the web rounds them (a native bar cannot be rounded)');
  }

  return series;
}

/**
 * Whether a label sits centred just past a bar's end, where a native chart puts an `outEnd` label.
 *
 * @param item - The label.
 * @param bounds - The bar's box.
 * @param horizontal - Whether bars run horizontally.
 * @param positive - Whether the bar grows up or right.
 */
function isOutsideEnd(
  item: ChartSvgItem,
  bounds: SceneRect,
  horizontal: boolean,
  positive: boolean,
): boolean {
  const text = item.text;
  if (text === null) {
    return false;
  }

  const reach = text.size * OUTSIDE_LABEL_REACH_SIZES;
  if (horizontal) {
    const middle = bounds.y + bounds.height / 2;
    const gap = positive ? text.x - (bounds.x + bounds.width) : bounds.x - text.x;
    return (
      Math.abs(text.y - middle) < TOLERANCE_PX &&
      gap >= 0 &&
      gap < reach * HORIZONTAL_LABEL_REACH_FACTOR
    );
  }

  const middle = bounds.x + bounds.width / 2;
  const gap = positive ? bounds.y - text.y : text.y - (bounds.y + bounds.height);
  return (
    text.anchor === 'middle' && Math.abs(text.x - middle) < TOLERANCE_PX && gap > 0 && gap < reach
  );
}

/**
 * A waterfall's series: an invisible base and the visible steps, colored as drawn.
 *
 * @param spec - The chart.
 * @param assigned - The bars found for each expected bar.
 */
function waterfallSeries(
  spec: ChartSpec,
  assigned: ReadonlyMap<ChartSvgItem, ExpectedBar>,
): NativeSeries[] {
  const base: (number | null)[] = spec.categories.map(() => null);
  const steps: (number | null)[] = spec.categories.map(() => null);
  const colors: (string | null)[] = spec.categories.map(() => null);
  for (const [item, bar] of assigned) {
    base[bar.category] = bar.lo;
    steps[bar.category] = bar.hi - bar.lo;
    colors[bar.category] = item.fill;
  }

  const empty = spec.categories.map(() => null);
  return [
    { ...seriesFrom('Base', base, empty, empty), color: null },
    seriesFrom(spec.series[0]?.name ?? 'Value', steps, colors, empty),
  ];
}

/**
 * A native series with one color or per-point colors.
 *
 * @param name - The series name.
 * @param values - The values.
 * @param colors - The drawn color of each point, `null` where none was drawn.
 * @param labels - The value labels.
 */
function seriesFrom(
  name: string,
  values: readonly (number | null)[],
  colors: readonly (string | null)[],
  labels: (NativeLabel | null)[],
): NativeSeries {
  const drawn = colors.filter((color): color is string => color !== null);
  const color = mostCommon(drawn) ?? '#808080';
  return {
    name,
    values: [...values],
    x: null,
    color,
    pointColors: drawn.every((candidate) => candidate === color) ? null : [...colors],
    lineWidth: 0,
    borderColor: null,
    marker: null,
    pointMarkers: null,
    labels,
  };
}

/**
 * The drawn lines and areas of a line or area chart, matched to its series.
 */
type LineMatch = {
  /**
   * The line drawn for each series.
   */
  lineOf: Map<number, ChartSvgItem>;

  /**
   * The area drawn for each series; empty for a line chart.
   */
  fillOf: Map<number, ChartSvgItem>;

  /**
   * The values as drawn (see {@link cumulative}).
   */
  stacks: (number | null)[][];

  /**
   * The categories each series has values for.
   */
  present: number[][];
};

/**
 * Matches the drawn lines (or areas) of a line or area chart to its series.
 *
 * @param spec - The chart.
 * @param svg - The plot SVG.
 * @returns The match, or why the drawn lines do not match the chart.
 */
function matchLines(spec: ChartSpec, svg: ChartSvg): LineMatch | string {
  const isArea = spec.kind === 'area';
  const lines = svg.items.filter(
    (item) => item.mark && item.commands.length > 1 && item.fill === null && item.stroke !== null,
  );
  const fills = svg.items.filter(
    (item) => item.mark && item.commands.length > 1 && item.fill !== null && item.tag === 'path',
  );
  if (lines.some((item) => item.commands.some((command) => command.type === 'C'))) {
    return 'curved lines are not matched';
  }

  const stacks = cumulative(spec);
  const present = spec.series.map((series) =>
    series.values.flatMap((value, index) => (value === null ? [] : [index])),
  );
  if (present.some((indexes) => !contiguous(indexes))) {
    return 'a series with gaps inside it is not matched';
  }

  const lineOf = assignPaths(lines, spec, stacks, present, (item) => item.stroke, 0);
  const fillOf = isArea
    ? assignPaths(fills, spec, stacks, present, (item) => item.fill, AREA_BASE_CORNERS)
    : new Map<number, ChartSvgItem>();
  if (lineOf === null || fillOf === null) {
    return 'lines do not match the series';
  }

  if (!isArea && lineOf.size !== spec.series.length) {
    return `${lineOf.size} lines drawn, ${spec.series.length} expected`;
  }

  if (isArea && fillOf.size !== spec.series.length) {
    return `${fillOf.size} areas drawn, ${spec.series.length} expected`;
  }

  return { lineOf, fillOf, stacks, present };
}

/**
 * Fits a line or area chart.
 *
 * @param spec - The chart.
 * @param svg - The plot SVG.
 */
function fitLines(spec: ChartSpec, svg: ChartSvg): Fitted | string {
  const isArea = spec.kind === 'area';
  const matched = matchLines(spec, svg);
  if (typeof matched === 'string') {
    return matched;
  }

  const { lineOf, fillOf, stacks, present } = matched;
  const points = fitLinePoints(lineOf, fillOf, present, stacks);
  if (points === null) {
    return 'points do not follow one scale';
  }

  const { xMap, yMap } = points;
  const consumed = new Set<ChartSvgItem>([...lineOf.values(), ...fillOf.values()]);
  const range = valueRange(
    spec,
    stacks.flatMap((values) => values.filter((value): value is number => value !== null)),
  );
  const { plot: plotRect, between } = linePlot(svg, spec, xMap, yMap, range);
  const markers = readMarkers(svg, spec, stacks, xMap, yMap, consumed);
  const reasons: string[] = [];
  if (isArea && lineOf.size > 0) {
    reasons.push('area outlines as a line chart over the areas');
  }

  const groups: NativeGroup[] = [];
  if (isArea) {
    groups.push(areaGroup(spec, fillOf));
  }

  const lineSeries = lineSeriesOf(spec, lineOf, markers, isArea, stacks);
  const drawnLines = lineSeries.filter((_, index) => lineOf.has(index));
  if (drawnLines.length > 0) {
    groups.push(lineGroup(drawnLines));
  }

  const geometry: PlotGeometry = {
    horizontal: false,
    plot: plotRect,
    valueMap: yMap,
    categoryAt: (category) => xMap.a + xMap.b * category,
    range,
  };
  const axes = readAxes(spec, svg, geometry, consumed);
  reasons.push(...axes.reasons);
  return finish(spec, svg, consumed, reasons, [], {
    name: spec.name,
    groups,
    categories: [...spec.categories],
    horizontal: false,
    crossBetween: between ? 'between' : 'midCat',
    plot: fractions(plotRect, svg.rect),
    categoryAxis: { ...axes.category, reversed: false },
    valueAxis: axes.value,
    legend: null,
    format: axes.format ?? spec.format.excel,
    font: commonFont(svg),
  });
}

/**
 * Fits the points of a line or area chart to the category and value scales. Every drawn point
 * contributes its category and its value as drawn, which for a stacked area is its running total.
 *
 * @param lineOf - The line drawn for each series.
 * @param fillOf - The area drawn for each series.
 * @param present - The categories each series has values for.
 * @param stacks - The values as drawn.
 * @returns The two scales, or `null` when the points do not follow one scale each.
 */
function fitLinePoints(
  lineOf: ReadonlyMap<number, ChartSvgItem>,
  fillOf: ReadonlyMap<number, ChartSvgItem>,
  present: readonly (readonly number[])[],
  stacks: readonly (readonly (number | null)[])[],
): { xMap: LinearMap; yMap: LinearMap } | null {
  const xPairs: [number, number][] = [];
  const yPairs: [number, number][] = [];
  for (const [index, item] of [...lineOf, ...fillOf]) {
    const points = item.commands.slice(0, present[index]?.length ?? 0);
    points.forEach((command, position) => {
      const category = present[index]?.[position] ?? 0;
      const point = command.points[0];
      if (point !== undefined) {
        xPairs.push([category, point.x]);
        yPairs.push([stacks[index]?.[category] ?? 0, point.y]);
      }
    });
  }

  const xMap = fitLinear(xPairs);
  const yMap = fitLinear(yPairs);
  if (!fitsWithinTolerance(xMap) || !fitsWithinTolerance(yMap)) {
    return null;
  }

  return { xMap, yMap };
}

/**
 * The plot area of a line or area chart. Its categories sit on the plot's edges, or in the middle
 * of their categories when the web's gridlines run half a category past the first and last points.
 *
 * @param svg - The plot SVG.
 * @param spec - The chart.
 * @param xMap - Category index to x.
 * @param yMap - Value to y.
 * @param range - The value range the plot shows.
 * @returns The plot, and whether the points sit between the gridlines.
 */
function linePlot(
  svg: ChartSvg,
  spec: ChartSpec,
  xMap: LinearMap,
  yMap: LinearMap,
  range: { min: number; max: number },
): { plot: SceneRect; between: boolean } {
  const edgeStart = xMap.a;
  const edgeEnd = xMap.a + xMap.b * (spec.categories.length - 1);
  const between = spansBetween(svg, xMap, spec.categories.length);
  const left = between ? edgeStart - xMap.b / 2 : edgeStart;
  const right = between ? edgeEnd + xMap.b / 2 : edgeEnd;
  const plot = rectFrom(left, yMap.a + yMap.b * range.max, right, yMap.a + yMap.b * range.min);
  return { plot, between };
}

/**
 * The series of a line or area chart as lines: colors and widths from the drawn lines, and the end
 * dots of the series.
 *
 * @param spec - The chart.
 * @param lineOf - The line drawn for each series.
 * @param markers - The end dots of each series.
 * @param isArea - Whether the chart is an area chart, whose series are drawn as stacked values.
 * @param stacks - The values as drawn.
 */
function lineSeriesOf(
  spec: ChartSpec,
  lineOf: ReadonlyMap<number, ChartSvgItem>,
  markers: ReadonlyMap<number, (NativeMarker | null)[]>,
  isArea: boolean,
  stacks: readonly (readonly (number | null)[])[],
): NativeSeries[] {
  return spec.series.map((source, index): NativeSeries => {
    const item = lineOf.get(index);
    return {
      ...seriesFrom(source.name, isArea ? (stacks[index] ?? []) : [...source.values], [], []),
      color: item?.stroke ?? null,
      pointColors: null,
      lineWidth: item?.strokeWidth ?? 0,
      pointMarkers: markers.get(index) ?? null,
      labels: spec.categories.map(() => null),
    };
  });
}

/**
 * The native area group of an area chart: each series filled with the color of its drawn area.
 *
 * @param spec - The chart.
 * @param fillOf - The area drawn for each series.
 */
function areaGroup(spec: ChartSpec, fillOf: ReadonlyMap<number, ChartSvgItem>): NativeGroup {
  return {
    type: 'area',
    grouping: spec.stacked ? 'stacked' : 'standard',
    series: spec.series.map((source, index) => ({
      ...seriesFrom(source.name, [...source.values], [], []),
      color: fillOf.get(index)?.fill ?? null,
      pointColors: null,
      labels: spec.categories.map(() => null),
    })),
    gapWidth: 0,
    overlap: 0,
    holeSize: 0,
    firstSliceAngle: 0,
  };
}

/**
 * The native line group of a line or area chart: the series whose lines were drawn.
 *
 * @param series - The series with a drawn line.
 */
function lineGroup(series: NativeSeries[]): NativeGroup {
  return {
    type: 'line',
    grouping: 'standard',
    series,
    gapWidth: 0,
    overlap: 0,
    holeSize: 0,
    firstSliceAngle: 0,
  };
}

/**
 * Each series' values as drawn: running totals for stacked charts.
 *
 * @param spec - The chart.
 */
function cumulative(spec: ChartSpec): (number | null)[][] {
  if (!spec.stacked) {
    return spec.series.map((series) => [...series.values]);
  }

  const totals = spec.categories.map(() => 0);
  return spec.series.map((series) =>
    series.values.map((value, index) => {
      if (value === null) {
        return null;
      }

      totals[index] = (totals[index] ?? 0) + value;
      return totals[index] ?? 0;
    }),
  );
}

/**
 * Whether indexes are consecutive.
 *
 * @param indexes - Sorted indexes.
 */
function contiguous(indexes: readonly number[]): boolean {
  return indexes.every(
    (value, position) => position === 0 || value === (indexes[position - 1] ?? 0) + 1,
  );
}

/**
 * Assigns drawn lines (or areas) to series: by color where it tells them apart, then by how well a
 * path's heights follow the series' values.
 *
 * @param paths - The drawn paths.
 * @param spec - The chart.
 * @param stacks - The values as drawn.
 * @param present - The categories each series has values for.
 * @param colorOf - The path's color.
 * @param extra - Points an area has besides the series' points: its two base corners, or (when it
 *   runs back along the baseline) one base point per category; 0 for lines.
 * @returns Paths by series index, or `null` when they do not match.
 */
function assignPaths(
  paths: readonly ChartSvgItem[],
  spec: ChartSpec,
  stacks: readonly (readonly (number | null)[])[],
  present: readonly (readonly number[])[],
  colorOf: (item: ChartSvgItem) => string | null,
  extra: number,
): Map<number, ChartSvgItem> | null {
  const result = new Map<number, ChartSvgItem>();
  const candidates = paths.flatMap((item) =>
    spec.series.flatMap((series, index) => {
      const count = present[index]?.length ?? 0;
      const points = item.commands.filter((command) => command.type !== 'Z').length;
      const fits =
        extra === 0
          ? points === count
          : points === count || points === count + extra || points === count * 2;
      if (!fits) {
        return [];
      }

      const colorMatch = sameRgb(colorOf(item), series.color) ? 0 : 1;
      const pairs = item.commands
        .slice(0, count)
        .map((command, position): [number, number] => [
          stacks[index]?.[present[index]?.[position] ?? 0] ?? 0,
          command.points[0]?.y ?? 0,
        ]);
      const fit = fitLinear(pairs);
      const fitScore = fit === null ? UNFITTED_PATH_SCORE : fit.error;
      return [{ item, index, score: colorMatch * COLOR_MISMATCH_SCORE + fitScore }];
    }),
  );
  candidates.sort((a, b) => a.score - b.score);
  const used = new Set<ChartSvgItem>();
  for (const candidate of candidates) {
    if (!used.has(candidate.item) && !result.has(candidate.index)) {
      result.set(candidate.index, candidate.item);
      used.add(candidate.item);
    }
  }

  return paths.every((item) => used.has(item)) ? result : null;
}

/**
 * Whether a line chart's gridlines run half a category past the first and last points (the points
 * sit in the middle of their categories).
 *
 * @param svg - The plot SVG.
 * @param xMap - Category index to x.
 * @param count - The number of categories.
 */
function spansBetween(svg: ChartSvg, xMap: LinearMap, count: number): boolean {
  const first = xMap.a;
  const lines = svg.items.filter((item) => !item.mark && item.tag === 'line' && isHorizontal(item));
  return (
    count > 1 &&
    lines.length > 0 &&
    lines.every((item) => Math.abs(minOf(xs(item)) - (first - xMap.b / 2)) < TOLERANCE_PX)
  );
}

/**
 * The end dots of lines and areas: each dot found on a series point becomes that point's marker.
 *
 * @param svg - The plot SVG.
 * @param spec - The chart.
 * @param stacks - The values as drawn.
 * @param xMap - Category index to x.
 * @param yMap - Value to y.
 * @param consumed - Collects the dots used.
 */
function readMarkers(
  svg: ChartSvg,
  spec: ChartSpec,
  stacks: readonly (readonly (number | null)[])[],
  xMap: LinearMap,
  yMap: LinearMap,
  consumed: Set<ChartSvgItem>,
): Map<number, (NativeMarker | null)[]> {
  const result = new Map<number, (NativeMarker | null)[]>();
  const dots = svg.items.filter((item) => item.mark && item.tag === 'circle');
  for (const dot of dots) {
    const cx = Number.parseFloat(dot.attrs['cx'] ?? 'NaN');
    const cy = Number.parseFloat(dot.attrs['cy'] ?? 'NaN');
    const bounds = extent(dot);
    if (bounds === null || !Number.isFinite(cx) || !Number.isFinite(cy)) {
      continue;
    }

    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const category = Math.round((centerX - xMap.a) / xMap.b);
    const series = spec.series.findIndex((candidate, index) => {
      const value = stacks[index]?.[category] ?? null;
      return (
        value !== null &&
        Math.abs(yMap.a + yMap.b * value - centerY) < TOLERANCE_PX &&
        sameRgb(dot.fill, candidate.color)
      );
    });
    const fallback = spec.series.findIndex((_, index) => {
      const value = stacks[index]?.[category] ?? null;
      return value !== null && Math.abs(yMap.a + yMap.b * value - centerY) < TOLERANCE_PX;
    });
    const index = series === -1 ? fallback : series;
    if (index === -1 || Math.abs(xMap.a + xMap.b * category - centerX) > TOLERANCE_PX) {
      continue;
    }

    const list = result.get(index) ?? spec.categories.map(() => null);
    list[category] = {
      size: bounds.width,
      fill: dot.fill ?? '#000000',
      line: dot.stroke,
      lineWidth: dot.strokeWidth,
    };
    result.set(index, list);
    consumed.add(dot);
  }

  return result;
}

/**
 * The gap, in degrees, that the drawn arcs leave between slices. Each slice's share of the turn
 * minus its drawn sweep is its gap, and the gaps must agree for the sizes to follow the values.
 *
 * @param values - The positive values of the slices.
 * @param geometry - Each drawn arc's geometry, or `null` for an arc that is not circular.
 * @returns The gap, or `null` when the gaps disagree.
 */
function sliceGap(
  values: readonly number[],
  geometry: readonly ({ sweep: number } | null)[],
): number | null {
  const total = values.reduce((sum, value) => sum + value, 0);
  const sweeps = geometry.map((arc) => arc?.sweep ?? 0);
  const gaps = values.map((value, index) => (value / total) * FULL_TURN - (sweeps[index] ?? 0));
  const gap = gaps.reduce((sum, value) => sum + value, 0) / gaps.length;
  return gaps.some((value) => Math.abs(value - gap) > 1) ? null : gap;
}

/**
 * The drawn color of each slice, in the order of the series' values: `null` for a value that is
 * missing or not positive, which has no slice.
 *
 * @param values - The series' values.
 * @param arcs - The drawn slices, in order.
 */
function sliceColors(
  values: readonly (number | null)[],
  arcs: readonly ChartSvgItem[],
): (string | null)[] {
  let drawn = 0;
  return values.map((value) => {
    if (value === null || value <= 0) {
      return null;
    }

    drawn += 1;
    return arcs[drawn - 1]?.stroke ?? null;
  });
}

/**
 * Fits a doughnut: slices drawn as thick arcs around one centre.
 *
 * @param spec - The chart.
 * @param svg - The plot SVG.
 */
function fitDoughnut(spec: ChartSpec, svg: ChartSvg): Fitted | string {
  const series = spec.series[0];
  if (series === undefined || spec.series.length > 1) {
    return 'only a single-series doughnut is matched';
  }

  const arcs = svg.items.filter((item) => item.mark && item.tag === 'path' && item.stroke !== null);
  const values = series.values.filter((value): value is number => value !== null && value > 0);
  if (arcs.length !== values.length || arcs.length === 0) {
    return `${arcs.length} slices drawn, ${values.length} expected`;
  }

  const geometry = arcs.map((item) => arcGeometry(item, svg));
  if (geometry.some((arc) => arc === null)) {
    return 'a slice is not a circular arc';
  }

  const first = geometry[0];
  if (first == null) {
    return 'no slices';
  }

  const gap = sliceGap(values, geometry);
  if (gap === null) {
    return 'slice sizes do not follow the values';
  }

  const width = arcs[0]?.strokeWidth ?? 0;
  const outer = first.radius + width / 2;
  const inner = first.radius - width / 2;
  const plotRect = {
    x: first.cx - outer,
    y: first.cy - outer,
    width: outer * 2,
    height: outer * 2,
  };
  const consumed = new Set<ChartSvgItem>(arcs);
  const colors = sliceColors(series.values, arcs);
  const plain = seriesFrom(
    series.name,
    [...series.values],
    colors,
    series.values.map(() => null),
  );
  const slices: NativeSeries = {
    ...plain,
    pointColors: colors,
    borderColor: gap > MIN_VISIBLE_SLICE_GAP_DEG ? spec.colors.plate : null,
    lineWidth: gap > MIN_VISIBLE_SLICE_GAP_DEG ? (gap / FULL_TURN) * 2 * Math.PI * first.radius : 0,
  };
  const reasons = ['slice labels and centre text as text boxes over the doughnut'];
  return finish(spec, svg, consumed, reasons, [], {
    name: spec.name,
    groups: [
      {
        type: 'doughnut',
        grouping: 'standard',
        series: [slices],
        gapWidth: 0,
        overlap: 0,
        holeSize: clamp(
          Math.round((inner / outer) * PERCENT),
          MIN_HOLE_SIZE_PERCENT,
          MAX_HOLE_SIZE_PERCENT,
        ),
        firstSliceAngle: normalizeAngle(Math.round(first.start - gap / 2)),
      },
    ],
    categories: [...spec.categories],
    horizontal: false,
    crossBetween: 'between',
    plot: fractions(plotRect, svg.rect),
    categoryAxis: null,
    valueAxis: null,
    legend: null,
    format: spec.format.excel,
    font: commonFont(svg),
  });
}

/**
 * A slice's arc: its centre, radius, start angle (clockwise from 12 o'clock) and sweep, in degrees,
 * from its SVG `A` command.
 *
 * @param item - The slice.
 * @param svg - The plot SVG, for the user-unit scale.
 */
function arcGeometry(
  item: ChartSvgItem,
  svg: ChartSvg,
): { cx: number; cy: number; radius: number; start: number; sweep: number } | null {
  const match = ARC_PATH_PATTERN.exec((item.attrs['d'] ?? '').trim());
  if (match === null) {
    return null;
  }

  const [x1, y1, rx, ry, , large, sweepFlag, x2, y2] = match.slice(1).map(Number);
  if (x1 === undefined || y1 === undefined) {
    return null;
  }

  if (x2 === undefined || y2 === undefined) {
    return null;
  }

  if (rx === undefined || ry === undefined || sweepFlag === undefined) {
    return null;
  }

  if (Math.abs(rx - ry) > ARC_RADIUS_TOLERANCE || sweepFlag !== 1) {
    return null;
  }

  const center = arcCenter(x1, y1, x2, y2, rx, large === 1, sweepFlag === 1);
  if (center === null) {
    return null;
  }

  const { scale } = svg.view;
  /**
   * The clockwise angle from 12 o'clock of a point.
   */
  const angle = (x: number, y: number): number =>
    normalizeAngle((Math.atan2(x - center.x, -(y - center.y)) * (FULL_TURN / 2)) / Math.PI);
  const start = angle(x1, y1);
  let sweep = angle(x2, y2) - start;
  if (sweep <= 0) {
    sweep += FULL_TURN;
  }

  return {
    cx: svg.rect.x + (center.x - svg.view.x) * scale,
    cy: svg.rect.y + (center.y - svg.view.y) * scale,
    radius: rx * scale,
    start,
    sweep,
  };
}

/**
 * The centre of an SVG circular arc from its endpoints (SVG 1.1, appendix F.6.5).
 *
 * @param x1 - Start x.
 * @param y1 - Start y.
 * @param x2 - End x.
 * @param y2 - End y.
 * @param radius - The radius.
 * @param large - The large-arc flag.
 * @param sweep - The sweep flag.
 */
export function arcCenter(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  radius: number,
  large: boolean,
  sweep: boolean,
): { x: number; y: number } | null {
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const distance = dx * dx + dy * dy;
  if (distance === 0) {
    return null;
  }

  const factor = Math.sqrt(Math.max(0, (radius * radius - distance) / distance));
  const sign = large === sweep ? -1 : 1;
  return {
    x: sign * factor * dy + (x1 + x2) / 2,
    y: sign * factor * -dx + (y1 + y2) / 2,
  };
}

/**
 * The series of a scatter. Points drawn in another color (a highlight) go in a series of their own,
 * since renderers that ignore per-point markers still draw those in their color.
 *
 * @param spec - The chart.
 * @param points - The points, in series order, with their values.
 * @param dots - The drawn dots, in the order of the points.
 * @param centers - The centre and size of each drawn dot.
 */
function scatterSeries(
  spec: ChartSpec,
  points: readonly { series: number; position: number; x: number; y: number }[],
  dots: readonly ChartSvgItem[],
  centers: readonly { x: number; y: number; size: number }[],
): NativeSeries[] {
  return spec.series.flatMap((source, index): NativeSeries[] => {
    const own = points.flatMap((point, position) => (point.series === index ? [position] : []));
    /**
     * The marker of the dot drawn for a point.
     */
    const markerAt = (position: number): NativeMarker => {
      const dot = dots[position];
      return {
        size: centers[position]?.size ?? DEFAULT_MARKER_SIZE_PX,
        fill: dot?.fill ?? '#000000',
        line: dot?.stroke ?? null,
        lineWidth: dot?.strokeWidth ?? 0,
      };
    };
    const common = mostCommon(own.map((position) => markerAt(position).fill));
    const fills = [...new Set(own.map((position) => markerAt(position).fill))].sort(
      (a, b) => Number(b === common) - Number(a === common),
    );
    return fills.map((fill): NativeSeries => {
      const members = own.filter((position) => markerAt(position).fill === fill);
      const first = members[0];
      return {
        ...seriesFrom(
          fill === common ? source.name : `${source.name} (highlighted)`,
          members.map((position) => points[position]?.y ?? null),
          [],
          [],
        ),
        x: members.map((position) => points[position]?.x ?? 0),
        color: null,
        pointColors: null,
        marker: first === undefined ? null : markerAt(first),
        labels: members.map(() => null),
      };
    });
  });
}

/**
 * Fits a scatter: dots at x and y values, drawn in data order.
 *
 * @param spec - The chart.
 * @param svg - The plot SVG.
 */
function fitScatter(spec: ChartSpec, svg: ChartSvg): Fitted | string {
  const dots = svg.items.filter((item) => item.mark && item.tag === 'circle');
  const points = spec.series.flatMap((series, index) =>
    series.values.flatMap((value, position) => {
      const x = series.x?.[position];
      return value === null || x === undefined ? [] : [{ series: index, position, x, y: value }];
    }),
  );
  if (dots.length !== points.length || dots.length === 0) {
    return `${dots.length} dots drawn, ${points.length} expected`;
  }

  const centers = dots.map((dot) => {
    const bounds = extent(dot) ?? { x: 0, y: 0, width: 0, height: 0 };
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, size: bounds.width };
  });
  const xMap = fitLinear(points.map((point, index) => [point.x, centers[index]?.x ?? 0]));
  const yMap = fitLinear(points.map((point, index) => [point.y, centers[index]?.y ?? 0]));
  if (!fitsWithinTolerance(xMap) || !fitsWithinTolerance(yMap)) {
    return 'dots do not follow the data in order';
  }

  const consumed = new Set<ChartSvgItem>(dots);
  const frame = plotFrame(svg) ?? {
    x: minOf(centers.map((point) => point.x)),
    y: minOf(centers.map((point) => point.y)),
    width: 1,
    height: 1,
  };
  const xRange = {
    min: (frame.x - xMap.a) / xMap.b,
    max: (frame.x + frame.width - xMap.a) / xMap.b,
  };
  const yRange = {
    min: (frame.y + frame.height - yMap.a) / yMap.b,
    max: (frame.y - yMap.a) / yMap.b,
  };
  // Points drawn in another color (a highlight) go in a series of their own: renderers that ignore
  // per-point markers still draw them in their color.
  const series = scatterSeries(spec, points, dots, centers);
  const yGeometry: PlotGeometry = {
    horizontal: false,
    plot: frame,
    valueMap: yMap,
    categoryAt: () => Number.NaN,
    range: yRange,
  };
  const axes = readAxes(spec, svg, yGeometry, consumed);
  const xAxis = readScatterXAxis(svg, frame, xMap, consumed);
  const reasons = [...axes.reasons, 'trend line, point labels and axis titles as shapes'];
  return finish(spec, svg, consumed, reasons, [], {
    name: spec.name,
    groups: [
      {
        type: 'scatter',
        grouping: 'standard',
        series,
        gapWidth: 0,
        overlap: 0,
        holeSize: 0,
        firstSliceAngle: 0,
      },
    ],
    categories: [],
    horizontal: false,
    crossBetween: 'midCat',
    plot: fractions(frame, svg.rect),
    categoryAxis: { ...xAxis, min: round(xRange.min), max: round(xRange.max) },
    valueAxis: { ...axes.value, min: round(yRange.min), max: round(yRange.max) },
    legend: null,
    format: axes.format ?? spec.format.excel,
    font: commonFont(svg),
  });
}

/**
 * The box the axis lines and gridlines of a plot enclose.
 *
 * @param svg - The plot SVG.
 */
function plotFrame(svg: ChartSvg): SceneRect | null {
  const lines = svg.items.filter((item) => !item.mark && item.tag === 'line');
  if (lines.length === 0) {
    return null;
  }

  const left = minOf(lines.flatMap(xs));
  const right = maxOf(lines.flatMap(xs));
  const top = minOf(lines.flatMap(ys));
  const bottom = maxOf(lines.flatMap(ys));
  return right > left && bottom > top ? rectFrom(left, top, right, bottom) : null;
}

/**
 * The x axis of a scatter: vertical gridlines, the axis line and tick labels under the plot.
 *
 * @param svg - The plot SVG.
 * @param frame - The plot frame.
 * @param xMap - Value to x.
 * @param consumed - Collects what the native axis draws.
 */
function readScatterXAxis(
  svg: ChartSvg,
  frame: SceneRect,
  xMap: LinearMap,
  consumed: Set<ChartSvgItem>,
): NativeAxis {
  const bottom = frame.y + frame.height;
  const ticks = svg.items.filter(
    (item) =>
      !consumed.has(item) &&
      item.text !== null &&
      item.text.anchor === 'middle' &&
      item.text.y > bottom &&
      item.text.y - bottom < item.text.size * TICK_LABEL_REACH_SIZES,
  );
  const values = ticks.map((item) => ((item.text?.x ?? 0) - xMap.a) / xMap.b);
  const texts = ticks.map((item) => item.text?.lines.join(' ') ?? '');
  const format = deriveFormat(texts, values);
  const step = values.length > 1 ? (values.at(-1) ?? 0) - (values.at(-2) ?? 0) : null;
  const grid = svg.items.filter(
    (item) =>
      !item.mark &&
      item.tag === 'line' &&
      isVertical(item) &&
      Math.abs(minOf(ys(item)) - frame.y) < TOLERANCE_PX &&
      Math.abs(maxOf(ys(item)) - bottom) < TOLERANCE_PX,
  );
  const axisLine = svg.items.find(
    (item) =>
      !item.mark &&
      item.tag === 'line' &&
      isHorizontal(item) &&
      Math.abs((ys(item)[0] ?? 0) - bottom) < TOLERANCE_PX,
  );
  const font = ticks[0] === undefined ? null : fontOf(ticks[0]);
  const labels =
    format !== null && font !== null && ticks.length > 1 && uniformFonts(ticks)
      ? { font, format }
      : null;
  if (labels !== null) {
    ticks.forEach((item) => consumed.add(item));
  }

  const gridColor = grid[0]?.stroke ?? null;
  const gridlines =
    gridColor !== null && grid.length > 1 && labels !== null
      ? { color: gridColor, width: grid[0]?.strokeWidth ?? 1 }
      : null;
  if (gridlines !== null) {
    grid.forEach((item) => consumed.add(item));
  }

  if (axisLine !== undefined) {
    consumed.add(axisLine);
  }

  return {
    min: null,
    max: null,
    majorUnit: labels === null ? null : step,
    labels,
    line: axisLine?.stroke == null ? null : { color: axisLine.stroke, width: axisLine.strokeWidth },
    gridlines,
    reversed: false,
  };
}

/**
 * Where the plot sits and how values and categories map to pixels.
 */
type PlotGeometry = {
  /**
   * Whether bars run horizontally (the value axis is x).
   */
  horizontal: boolean;

  /**
   * The inner plot area in canvas pixels.
   */
  plot: SceneRect;

  /**
   * Value to pixel along the value axis.
   */
  valueMap: LinearMap;

  /**
   * Category index to pixel along the category axis.
   */
  categoryAt: (category: number) => number;

  /**
   * The value axis range.
   */
  range: { min: number; max: number };
};

/**
 * The axes as the web draws them: category labels (native when every category has one in one
 * style), value tick labels (native when a number format reproduces them), gridlines (native when
 * they sit at the ticks across the plot) and the baseline (the category axis line).
 *
 * @param spec - The chart.
 * @param svg - The plot SVG.
 * @param geometry - The fitted plot.
 * @param consumed - Collects what the native axes draw.
 */
function readAxes(
  spec: ChartSpec,
  svg: ChartSvg,
  geometry: PlotGeometry,
  consumed: Set<ChartSvgItem>,
): {
  category: Omit<NativeAxis, 'reversed'>;
  value: NativeAxis;
  format: string | null;
  reasons: string[];
} {
  const reasons: string[] = [];
  const { range } = geometry;
  noteCategoryLabels(spec, svg, geometry, consumed, reasons);
  const tickFit = readValueTicks(spec, svg, geometry, consumed, reasons);
  const { step, format, tickFont, nativeTicks } = tickFit;
  const { baseline, foundGrid, gridStroke, nativeGrid } = readGridlines(
    svg,
    geometry,
    tickFit,
    consumed,
  );
  const majorUnit = (nativeTicks || nativeGrid) && step !== null ? step : null;
  return {
    category: {
      min: null,
      max: null,
      majorUnit: null,
      labels: null,
      line:
        baseline?.stroke == null ? null : { color: baseline.stroke, width: baseline.strokeWidth },
      gridlines: null,
    },
    value: {
      min: range.min,
      max: range.max,
      majorUnit,
      labels:
        nativeTicks && tickFont !== null && format !== null ? { font: tickFont, format } : null,
      line: null,
      gridlines:
        nativeGrid && gridStroke !== null
          ? { color: gridStroke, width: foundGrid[0]?.strokeWidth ?? 1 }
          : null,
      reversed: false,
    },
    format: nativeTicks ? format : null,
    reasons,
  };
}

/**
 * Notes the category labels that remain overlay text boxes at their measured positions.
 *
 * @param spec - The chart's category names.
 * @param svg - The measured plot items.
 * @param geometry - The fitted category and value scales.
 * @param consumed - Items already drawn natively; category labels stay outside this set.
 * @param reasons - Receives a note when any category label is present.
 */
function noteCategoryLabels(
  spec: ChartSpec,
  svg: ChartSvg,
  geometry: PlotGeometry,
  consumed: ReadonlySet<ChartSvgItem>,
  reasons: string[],
): void {
  const { plot, horizontal } = geometry;
  /**
   * A text's position along the category axis.
   */
  const along = (item: ChartSvgItem): number =>
    horizontal ? (item.text?.y ?? 0) : (item.text?.x ?? 0);
  /**
   * A text's position along the value axis.
   */
  const across = (item: ChartSvgItem): number =>
    horizontal ? (item.text?.x ?? 0) : (item.text?.y ?? 0);
  const plotEnd = horizontal ? plot.x : plot.y + plot.height;
  // Category labels are text boxes where the web set them: native category labels sit at a
  // renderer-chosen distance from the axis and wrap, tilt or skip long labels on their own.
  const categoryTexts = spec.categories.flatMap((category, index) =>
    svg.items.filter(
      (item) =>
        !consumed.has(item) &&
        item.text !== null &&
        item.text.lines.join(' ') === category &&
        Math.abs(along(item) - geometry.categoryAt(index)) < TOLERANCE_PX &&
        (horizontal ? across(item) < plotEnd : across(item) > plotEnd),
    ),
  );
  if (categoryTexts.length > 0) {
    reasons.push('category labels as text boxes where the web set them');
  }
}

/**
 * The measured tick sequence and the native label decision used to fit its gridlines.
 */
type TickFit = {
  /**
   * The values the chart declares as ticks.
   */
  ticks: readonly number[];

  /**
   * The distance between the first two ticks, or null for fewer than two.
   */
  step: number | null;

  /**
   * Whether the complete tick sequence follows one positive step.
   */
  evenTicks: boolean;

  /**
   * The number format that reproduces the measured labels, or null.
   */
  format: string | null;

  /**
   * The font of the first measured tick label, or null.
   */
  tickFont: ChartFont | null;

  /**
   * Whether the native chart can reproduce every label in its measured style.
   */
  nativeTicks: boolean;
};

/**
 * Fits the value labels and consumes them only when the native axis reproduces all of them.
 *
 * @param spec - The chart's declared ticks.
 * @param svg - The measured plot items.
 * @param geometry - The fitted plot and value scale.
 * @param consumed - Receives labels that the native axis draws.
 * @param reasons - Receives the reason when measured labels must stay overlays.
 */
function readValueTicks(
  spec: ChartSpec,
  svg: ChartSvg,
  geometry: PlotGeometry,
  consumed: Set<ChartSvgItem>,
  reasons: string[],
): TickFit {
  const { plot, horizontal, valueMap, range } = geometry;
  /**
   * The label's coordinate along the value axis.
   */
  const across = (item: ChartSvgItem): number =>
    horizontal ? (item.text?.x ?? 0) : (item.text?.y ?? 0);
  const ticks = spec.axis?.ticks ?? [];
  const tickTexts = ticks.map((tick) =>
    svg.items.find(
      (item) =>
        !consumed.has(item) &&
        item.text !== null &&
        Math.abs(across(item) - (valueMap.a + valueMap.b * tick)) < TOLERANCE_PX &&
        (horizontal ? item.text.y > plot.y + plot.height : item.text.x < plot.x),
    ),
  );
  const foundTicks = tickTexts.filter((item): item is ChartSvgItem => item !== undefined);
  const step = ticks.length > 1 ? (ticks[1] ?? 0) - (ticks[0] ?? 0) : null;
  const evenTicks =
    step !== null &&
    step > 0 &&
    ticks.every(
      (tick, index) =>
        Math.abs(tick - ((ticks[0] ?? 0) + index * step)) < step * TICK_TOLERANCE_RATIO,
    );
  const format =
    foundTicks.length === ticks.length && ticks.length > 1
      ? deriveFormat(
          foundTicks.map((item) => item.text?.lines.join(' ') ?? ''),
          [...ticks],
        )
      : null;
  const tickFont = foundTicks[0] === undefined ? null : fontOf(foundTicks[0]);
  const nativeTicks =
    format !== null &&
    tickFont !== null &&
    evenTicks &&
    Math.abs((ticks[0] ?? 0) - range.min) < (step ?? 1) * TICK_TOLERANCE_RATIO &&
    uniformFonts(foundTicks);
  if (nativeTicks) {
    foundTicks.forEach((item) => consumed.add(item));
  } else if (foundTicks.length > 0) {
    reasons.push('value axis labels as text boxes (no number format reproduces them)');
  }

  return { ticks, step, evenTicks, format, tickFont, nativeTicks };
}

/**
 * Fits the axis baseline and the gridlines after native value labels have been consumed.
 *
 * @param svg - The measured plot items.
 * @param geometry - The fitted plot and value scale.
 * @param tickFit - The tick spacing and label decision.
 * @param consumed - Receives the baseline and any complete matching native grid.
 * @returns The matched rules and whether their grid is native.
 */
function readGridlines(
  svg: ChartSvg,
  geometry: PlotGeometry,
  tickFit: TickFit,
  consumed: Set<ChartSvgItem>,
): {
  baseline: ChartSvgItem | undefined;
  foundGrid: ChartSvgItem[];
  gridStroke: string | null;
  nativeGrid: boolean;
} {
  const { plot, horizontal, valueMap, range } = geometry;
  const { ticks, step, evenTicks } = tickFit;
  const crossing = range.min <= 0 && range.max >= 0 ? 0 : range.min;
  /**
   * Whether a line runs across the value axis (a gridline or baseline).
   */
  const perpendicular = (item: ChartSvgItem): boolean =>
    horizontal ? isVertical(item) : isHorizontal(item);
  /**
   * A rule's position along the value axis.
   */
  const position = (item: ChartSvgItem): number =>
    horizontal ? (xs(item)[0] ?? 0) : (ys(item)[0] ?? 0);
  /**
   * Whether a rule runs the whole plot along the category axis.
   */
  const spansPlot = (item: ChartSvgItem): boolean => {
    const values = horizontal ? ys(item) : xs(item);
    const start = horizontal ? plot.y : plot.x;
    const end = horizontal ? plot.y + plot.height : plot.x + plot.width;
    return (
      Math.abs(minOf(values) - start) < TOLERANCE_PX && Math.abs(maxOf(values) - end) < TOLERANCE_PX
    );
  };
  const rules = svg.items.filter(
    (item) =>
      !consumed.has(item) &&
      !item.mark &&
      item.tag === 'line' &&
      item.dash === null &&
      perpendicular(item),
  );
  const baseline = rules.find(
    (item) =>
      Math.abs(position(item) - (valueMap.a + valueMap.b * crossing)) < TOLERANCE_PX &&
      spansPlot(item),
  );
  if (baseline !== undefined) {
    consumed.add(baseline);
  }

  const gridTicks = ticks.filter(
    (tick) => Math.abs(tick - crossing) > (step ?? 1) * TICK_TOLERANCE_RATIO,
  );
  const grid = gridTicks.map((tick) =>
    rules.find(
      (item) =>
        item !== baseline &&
        Math.abs(position(item) - (valueMap.a + valueMap.b * tick)) < TOLERANCE_PX &&
        spansPlot(item),
    ),
  );
  const foundGrid = grid.filter((item): item is ChartSvgItem => item !== undefined);
  const gridStroke = foundGrid[0]?.stroke ?? null;
  const nativeGrid =
    evenTicks &&
    gridStroke !== null &&
    foundGrid.length === gridTicks.length &&
    foundGrid.length > 0 &&
    foundGrid.every((item) => item.stroke === gridStroke) &&
    Math.abs((ticks[0] ?? 0) - range.min) < (step ?? 1) * TICK_TOLERANCE_RATIO;
  if (nativeGrid) {
    foundGrid.forEach((item) => consumed.add(item));
  }

  return { baseline, foundGrid, gridStroke, nativeGrid };
}

/**
 * The value axis range: the spec's axis, widened to the drawn values.
 *
 * @param spec - The chart.
 * @param values - The values drawn.
 */
function valueRange(spec: ChartSpec, values: readonly number[]): { min: number; max: number } {
  const low = minOf(values, 0);
  const high = maxOf(values, 0);
  const min = Math.min(spec.axis?.min ?? low, low);
  const max = Math.max(spec.axis?.max ?? high, high);
  return { min, max: max > min ? max : min + 1 };
}

/**
 * Collects everything the native chart does not draw as overlays and finishes the plan.
 *
 * @param spec - The chart.
 * @param svg - The plot SVG.
 * @param consumed - What the native chart draws.
 * @param reasons - Notes so far.
 * @param changes - Visible differences so far.
 * @param model - The native chart.
 */
function finish(
  spec: ChartSpec,
  svg: ChartSvg,
  consumed: ReadonlySet<ChartSvgItem>,
  reasons: string[],
  changes: string[],
  model: NativeChartModel,
): Fitted {
  const firstMark = Math.min(
    ...svg.items.filter((item) => consumed.has(item) && item.mark).map((item) => item.index),
  );
  const overlays = svg.items
    .filter((item) => !consumed.has(item))
    .map((item): ChartOverlay => ({ item, behind: item.index < firstMark }));
  const labels = overlays.filter((overlay) => overlay.item.text !== null).length;
  const shapes = overlays.length - labels;
  if (labels > 0 || shapes > 0) {
    reasons.unshift(
      `${labels} label(s) and ${shapes} shape(s) the native chart cannot draw exactly, ` +
        'as text boxes and shapes',
    );
  }

  if (spec.annotations.length > 0) {
    reasons.push(
      ...spec.annotations.map(
        (annotation) => `${annotation.type} annotation "${annotation.label}" drawn as shapes`,
      ),
    );
  }

  if (spec.legend) {
    reasons.push('legend drawn as shapes, as the web draws it');
  }

  return { model, overlays, reasons, changes };
}

/**
 * A native chart built from the description alone, for `--mode native` when the web's drawing
 * cannot be matched: default layout, axes from the spec, the spec's labels.
 *
 * @param spec - The chart.
 */
export function basicModel(spec: ChartSpec): NativeChartModel {
  const font: ChartFont = {
    family: '',
    size: DEFAULT_FONT_SIZE_PX,
    color: spec.colors.label,
    bold: false,
  };
  const valueFont: ChartFont = { ...font, color: spec.colors.value };
  const type = basicType(spec);
  const series = basicSeries(spec, type, valueFont);
  const axis = basicAxis(spec, type, font);
  return {
    name: spec.name,
    groups: [
      {
        type,
        grouping: basicGrouping(spec, type),
        series,
        gapWidth: BASIC_GAP_WIDTH_PERCENT,
        overlap: spec.stacked ? PERCENT : 0,
        holeSize: BASIC_HOLE_SIZE_PERCENT,
        firstSliceAngle: 0,
      },
    ],
    categories: [...spec.categories],
    horizontal: spec.orientation === 'horizontal',
    crossBetween: type === 'bar' ? 'between' : 'midCat',
    plot: null,
    categoryAxis:
      axis === null
        ? null
        : {
            ...axis,
            min: null,
            max: null,
            labels: { font, format: 'General' },
            line: { color: spec.colors.axis, width: 1 },
            gridlines: null,
            reversed: spec.orientation === 'horizontal',
          },
    valueAxis: axis,
    legend: spec.legend ? { font } : null,
    format: spec.format.excel,
    font,
  };
}

/**
 * The series of a chart drawn from its description alone: plain lines and markers, with the value
 * labels in the value font.
 *
 * @param spec - The chart.
 * @param type - Its chart type.
 * @param valueFont - The font of the value labels.
 */
function basicSeries(
  spec: ChartSpec,
  type: NativeGroup['type'],
  valueFont: ChartFont,
): NativeSeries[] {
  return spec.series.map((source): NativeSeries => ({
    name: source.name,
    values: [...source.values],
    x: source.x === null ? null : [...source.x],
    color: source.color,
    pointColors: source.pointColors === null ? null : [...source.pointColors],
    lineWidth: type === 'line' ? BASIC_LINE_WIDTH_PX : 0,
    borderColor: null,
    marker:
      type === 'scatter'
        ? { size: BASIC_MARKER_SIZE_PX, fill: source.color, line: null, lineWidth: 0 }
        : null,
    pointMarkers: null,
    labels: source.labels.map((text) => (text === null ? null : { text, font: valueFont })),
  }));
}

/**
 * The value axis of a chart drawn from its description alone: none for a doughnut, else the spec's
 * limits with the value labels in the given font.
 *
 * @param spec - The chart.
 * @param type - Its chart type.
 * @param font - The font of the axis labels.
 */
function basicAxis(spec: ChartSpec, type: NativeGroup['type'], font: ChartFont): NativeAxis | null {
  if (type === 'doughnut') {
    return null;
  }

  return {
    min: spec.axis?.min ?? null,
    max: spec.axis?.max ?? null,
    majorUnit: null,
    labels: { font, format: spec.format.excel },
    line: null,
    gridlines: { color: spec.colors.grid, width: 1 },
    reversed: false,
  };
}

/**
 * The chart type of a chart drawn from its description alone.
 *
 * @param spec - The chart.
 */
function basicType(spec: ChartSpec): NativeGroup['type'] {
  switch (spec.native) {
    case 'doughnut':
    case 'line':
    case 'area':
    case 'scatter': {
      return spec.native;
    }

    case 'bar':
    case 'table':
    case null: {
      return 'bar';
    }
  }
}

/**
 * How the series of a chart drawn from its description alone combine.
 *
 * @param spec - The chart.
 * @param type - Its chart type.
 */
function basicGrouping(spec: ChartSpec, type: NativeGroup['type']): NativeGroup['grouping'] {
  if (spec.stacked) {
    return 'stacked';
  }

  return type === 'bar' ? 'clustered' : 'standard';
}

/**
 * What a chart drawn from its description alone loses against the web, for the report.
 *
 * @param spec - The chart.
 */
function lostByBasicModel(spec: ChartSpec): string[] {
  const lost = ['layout, label placement and axis styling follow PowerPoint defaults'];
  if (spec.annotations.length > 0) {
    lost.push(
      ...spec.annotations.map((annotation) => `${annotation.type} "${annotation.label}" dropped`),
    );
  }

  if (spec.kind === 'scatter') {
    lost.push('trend line and point labels dropped');
  }

  if (!PLAIN_KINDS.has(spec.kind)) {
    lost.push(`${spec.kind} drawn as a plain ${spec.native ?? ''} chart`);
  }

  return lost;
}

/**
 * A number format code that writes the given values as the given texts, such as `"$"#,##0.0,,"M"`
 * for `$1.5M` and `$2.0M`, or `null` when none does (mixed decimals, mixed units, another locale).
 *
 * @param texts - The texts as shown.
 * @param values - The values they show.
 */
export function deriveFormat(texts: readonly string[], values: readonly number[]): string | null {
  if (texts.length === 0 || texts.length !== values.length) {
    return null;
  }

  const parts = parseFormattedTexts(texts);
  if (parts === null) {
    return null;
  }

  const first = parts[0];
  if (
    first === undefined ||
    parts.some(
      (part) =>
        part.prefix !== first.prefix ||
        part.suffix !== first.suffix ||
        part.decimals.length !== first.decimals.length,
    )
  ) {
    return null;
  }

  const scale = scaleOf(parts, values);
  if (scale === undefined) {
    return null;
  }

  const grouping = parts.some((part) => part.integer.includes(','));
  /**
   * Text as a quoted literal of a number format, or nothing for none.
   */
  const quote = (text: string): string => (text === '' ? '' : `"${text.replaceAll('"', '')}"`);
  const decimals = first.decimals.length;
  const decimalPart = decimals > 0 ? `.${'0'.repeat(decimals)}` : '';
  const thousandsCommas = ','.repeat(Math.round(Math.log10(scale) / LOG10_PER_THOUSAND));
  const code = [
    quote(first.prefix),
    grouping ? '#,##0' : '0',
    decimalPart,
    thousandsCommas,
    quote(first.suffix),
  ].join('');
  const reproduced = values.every(
    (value, index) =>
      normalizeSign(formatWith(code, value)) === normalizeSign(texts[index]?.trim() ?? ''),
  );
  return reproduced ? code : null;
}

/**
 * A number as a number format wrote it, split into the parts a format code is made of.
 */
type ParsedNumber = {
  /**
   * The text before the number, its sign excluded.
   */
  prefix: string;

  /**
   * The integer digits, with their thousands commas.
   */
  integer: string;

  /**
   * The decimal digits, without the point.
   */
  decimals: string;

  /**
   * The text after the number.
   */
  suffix: string;
};

/**
 * Splits each text into its number's parts.
 *
 * @param texts - The texts as shown.
 * @returns The parts, or `null` when a text is not a number.
 */
function parseFormattedTexts(texts: readonly string[]): ParsedNumber[] | null {
  const parsed = texts.map((text) => FORMATTED_NUMBER_PATTERN.exec(text.trim()));
  if (parsed.some((match) => match === null)) {
    return null;
  }

  return parsed.map((match) => ({
    prefix: `${match?.[1] ?? ''}${match?.[3] ?? ''}`,
    integer: match?.[4] ?? '0',
    decimals: match?.[5] ?? '',
    suffix: match?.[6] ?? '',
  }));
}

/**
 * The scale (units, thousands, millions or billions) the shown numbers are written at, the same for
 * every value.
 *
 * @param parts - The parts of each shown number.
 * @param values - The values they show.
 * @returns The scale, or `undefined` when no one scale fits every value.
 */
function scaleOf(parts: readonly ParsedNumber[], values: readonly number[]): number | undefined {
  const scales = parts.flatMap((part, index) => {
    const shown = Number(`${part.integer.replaceAll(',', '')}.${part.decimals || '0'}`);
    const value = Math.abs(values[index] ?? 0);
    return shown === 0 ? [] : [value / shown];
  });
  return FORMAT_SCALES.find((candidate) =>
    scales.every((value) => Math.abs(value / candidate - 1) < SCALE_TOLERANCE),
  );
}

/**
 * Formats a value with a code written by {@link deriveFormat}, as a spreadsheet would in English.
 *
 * @param code - The format code.
 * @param value - The value.
 */
export function formatWith(code: string, value: number): string {
  const match = FORMAT_CODE_PATTERN.exec(code);
  if (match === null) {
    return String(value);
  }

  const scaled = Math.abs(value) / THOUSAND ** (match[4]?.length ?? 0);
  const decimals = match[3]?.length ?? 0;
  const number = scaled.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: match[2] === '#,##0',
  });
  const sign = value < 0 && Number(number.replaceAll(',', '')) !== 0 ? '-' : '';
  return `${sign}${match[1] ?? ''}${number}${match[5] ?? ''}`;
}

/**
 * Text with the typographic minus as a hyphen.
 *
 * @param text - The text.
 */
function normalizeSign(text: string): string {
  return text.replaceAll('−', '-');
}

/**
 * The bounds of an SVG item's geometry.
 *
 * @param item - The item.
 */
function extent(item: ChartSvgItem): SceneRect | null {
  const bounds = pathBounds(item.commands);
  const negligible =
    bounds === null || (bounds.width < NEGLIGIBLE_EXTENT && bounds.height < NEGLIGIBLE_EXTENT);
  return negligible ? null : bounds;
}

/**
 * The middle of a box along the category axis.
 *
 * @param box - The box.
 */
function center(box: AxisBox): number {
  return (box.c0 + box.c1) / 2;
}

/**
 * The x coordinates of a line item's ends.
 *
 * @param item - The line.
 */
function xs(item: ChartSvgItem): number[] {
  return item.commands.flatMap((command) => command.points.map((point) => point.x));
}

/**
 * The y coordinates of a line item's ends.
 *
 * @param item - The line.
 */
function ys(item: ChartSvgItem): number[] {
  return item.commands.flatMap((command) => command.points.map((point) => point.y));
}

/**
 * Whether a line runs horizontally.
 *
 * @param item - The line.
 */
function isHorizontal(item: ChartSvgItem): boolean {
  const values = ys(item);
  return values.length > 1 && maxOf(values) - minOf(values) < FLAT_LINE_TOLERANCE;
}

/**
 * Whether a line runs vertically.
 *
 * @param item - The line.
 */
function isVertical(item: ChartSvgItem): boolean {
  const values = xs(item);
  return values.length > 1 && maxOf(values) - minOf(values) < FLAT_LINE_TOLERANCE;
}

/**
 * The font of a text item.
 *
 * @param item - The item.
 */
export function fontOf(item: ChartSvgItem): ChartFont {
  const text = item.text;
  return {
    family: text?.family ?? '',
    size: text?.size ?? DEFAULT_FONT_SIZE_PX,
    color: text?.color ?? '#000000',
    bold: (text?.weight ?? REGULAR_FONT_WEIGHT) >= BOLD_WEIGHT,
  };
}

/**
 * Whether text items share one font, size, weight and color.
 *
 * @param items - The items.
 */
function uniformFonts(items: readonly ChartSvgItem[]): boolean {
  const keys = new Set(items.map((item) => JSON.stringify(fontOf(item))));
  return keys.size <= 1;
}

/**
 * The font most chart text uses.
 *
 * @param svg - The plot SVG.
 */
function commonFont(svg: ChartSvg): ChartFont {
  const fonts = svg.items.flatMap((item) =>
    item.text === null ? [] : [JSON.stringify(fontOf(item))],
  );
  const common = mostCommon(fonts);
  return common === null
    ? { family: '', size: DEFAULT_FONT_SIZE_PX, color: '#000000', bold: false }
    : (JSON.parse(common) as ChartFont);
}

/**
 * The most frequent value.
 *
 * @param values - The values.
 */
function mostCommon<T>(values: readonly T[]): T | null {
  const counts = new Map<T, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  let best: T | null = null;
  let count = 0;
  for (const [value, seen] of counts) {
    if (seen > count) {
      best = value;
      count = seen;
    }
  }

  return best;
}

/**
 * Whether two colors have the same RGB (alpha ignored), within rounding.
 *
 * @param a - A color.
 * @param b - Another.
 */
function sameRgb(a: string | null, b: string | null): boolean {
  if (a === null || b === null) {
    return false;
  }

  /**
   * The red, green and blue channels of `#rrggbb`.
   */
  const channels = (hex: string): number[] =>
    RGB_CHANNEL_STARTS.map((start) =>
      Number.parseInt(hex.slice(start, start + CHANNEL_HEX_DIGITS), 16),
    );
  const left = channels(a);
  const right = channels(b);
  return left.every((value, index) => Math.abs(value - (right[index] ?? 0)) <= SAME_RGB_TOLERANCE);
}

/**
 * A rectangle from two corners.
 *
 * @param x0 - Left.
 * @param y0 - Top.
 * @param x1 - Right.
 * @param y1 - Bottom.
 */
function rectFrom(x0: number, y0: number, x1: number, y1: number): SceneRect {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    width: Math.abs(x1 - x0),
    height: Math.abs(y1 - y0),
  };
}

/**
 * A rectangle as fractions of another.
 *
 * @param inner - The inner rectangle.
 * @param outer - The outer one.
 */
function fractions(
  inner: SceneRect,
  outer: SceneRect,
): { x: number; y: number; width: number; height: number } {
  return {
    x: (inner.x - outer.x) / outer.width,
    y: (inner.y - outer.y) / outer.height,
    width: inner.width / outer.width,
    height: inner.height / outer.height,
  };
}

/**
 * A value within a range.
 *
 * @param value - The value.
 * @param min - The lowest.
 * @param max - The highest.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * An angle in degrees from 0 up to 360.
 *
 * @param degrees - Any angle.
 */
function normalizeAngle(degrees: number): number {
  return ((degrees % FULL_TURN) + FULL_TURN) % FULL_TURN;
}

/**
 * A number rounded to six significant digits, so axis limits read cleanly.
 *
 * @param value - The value.
 */
function round(value: number): number {
  return Number(value.toPrecision(AXIS_LIMIT_DIGITS));
}
