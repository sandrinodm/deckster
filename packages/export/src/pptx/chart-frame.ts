import type { OpcPackage } from '#ooxml/opc-package.ts';
import type { ExportMode } from '#plan/plan-scene.ts';
import type { ChartOverlay, ChartPlan, NativeChartModel } from '#pptx/chart-model.ts';
import type { ChartSvgItem, ChartSvgText } from '#pptx/chart-svg.ts';
import type { IdAllocator } from '#pptx/shape-xml.ts';
import type { SurfaceTheme } from '#pptx/theme.ts';
import type { ChartNode, SceneRect, SlideScene } from '#scene/scene.ts';

import { el, escapeXml } from '#ooxml/xml.ts';
import { planChart } from '#plan/chart-policy.ts';
import { chartTypeface, chartWorkbook, chartXml } from '#pptx/chart-xml.ts';
import { CHART_NAMESPACE, CONTENT_TYPE, REL } from '#pptx/namespaces.ts';
import { cNvPr, customGeometry, groupXml, xfrm } from '#pptx/shape-xml.ts';
import { colorXml } from '#pptx/theme.ts';
import { fontSizeHundredths, maxOf, minOf, pointsHundredths, pxToEmu } from '#units.ts';
import { pathBounds } from '#vector/svg-path.ts';

/**
 * The URI of a chart graphic frame's data.
 */
const CHART_URI = 'http://schemas.openxmlformats.org/drawingml/2006/chart';

/**
 * The average advance of a character as a share of the font size, to size overlay text boxes.
 */
const CHARACTER_EM = 0.62;

/**
 * The smallest width, height or stroke, in canvas pixels, that a drawn overlay shape takes. It
 * keeps a zero-size box and a dash scaled by a zero stroke out of the markup.
 */
const MIN_DRAWN_PX = 0.01;

/**
 * The CSS font weight from which a chart label is drawn bold.
 */
const BOLD_FONT_WEIGHT = 600;

/**
 * The longest name a chart label's shape gets in the selection pane.
 */
const LABEL_NAME_MAX_CHARS = 120;

/**
 * DrawingML dash lengths are in thousandths of a percent of the line width.
 */
const DASH_UNITS = 100_000;

/**
 * Matches the shape id of a graphic frame's `p:cNvPr`.
 */
const FRAME_ID_PATTERN = /<p:cNvPr id="(\d+)"/;

/**
 * The markup compatibility namespace.
 */
const MC_NAMESPACE = 'http://schemas.openxmlformats.org/markup-compatibility/2006';

/**
 * The DrawingML 2010 namespace a native chart's alternate content requires. PowerPoint 2010 and
 * later and LibreOffice understand it and draw the native chart; Apple's Office renderer (Quick
 * Look, Keynote's import) does not, and draws the fallback picture instead of a chart it would draw
 * without its colors, labels and layout. Requiring `p14` or `p15` instead would send Apple to the
 * chart: it understands those.
 */
const ALTERNATE_NAMESPACE = {
  /**
   * The prefix.
   */
  prefix: 'a14',

  /**
   * The namespace.
   */
  uri: 'http://schemas.microsoft.com/office/drawing/2010/main',
} as const;

/**
 * What the chart writer needs from the slide it writes.
 */
export type ChartFrameContext = {
  /**
   * The package, which gets the chart part and its workbook.
   */
  pkg: OpcPackage;

  /**
   * The slide part's path.
   */
  path: string;

  /**
   * The slide's scene, for the chart's plot.
   */
  scene: Pick<SlideScene, 'nodes' | 'tree'>;

  /**
   * The theme of the slide's surface.
   */
  theme: SurfaceTheme;

  /**
   * The export mode.
   */
  mode: ExportMode;

  /**
   * Allocates shape ids.
   */
  nextId: IdAllocator;

  /**
   * Writes the picture of a chart's plot as the fallback of the chart's alternate content: the
   * plot's scene node id, the shape id (the same as the chart's), its name and alt text; returns
   * `''` when there is no picture. `null` writes the chart without alternate content (`--mode
   * native`).
   */
  fallback: ((plotId: number, id: number, name: string, alt: string) => string) | null;
};

/**
 * A written chart.
 */
export type WrittenChart = {
  /**
   * The markup: the chart's graphic frame, grouped with the shapes drawn over and under it.
   */
  xml: string;

  /**
   * The id of the outermost shape, for step animations; `null` when nothing was written.
   */
  shapeId: number | null;
};

/**
 * Writes a chart the planner made native: the chart part with its embedded workbook in a graphic
 * frame where the web drew the plot, named `Chart: <name>` with the chart's text summary as alt
 * text, between the shapes that reproduce what the native chart cannot draw (direct labels, centre
 * text, annotations, legends, connectors), all in one group.
 *
 * @param context - The package, slide, theme and ids.
 * @param node - The chart.
 * @returns The markup, or nothing when the chart is a picture.
 */
export function writeChart(context: ChartFrameContext, node: ChartNode): WrittenChart {
  const plan = planChart(node, context.scene, context.mode);
  const plot = context.scene.nodes.find((candidate) => candidate.id === plan.plotId);
  if (plan.model === null) {
    return { xml: '', shapeId: null };
  }

  const rect = plot?.rect ?? node.rect;
  const relId = addChartParts(context, plan.model);
  const name = chartName(node);
  const frame = chartFrameXml(context, node, relId, name, rect);
  const alt = node.chart.summary || node.chart.name;
  if (plan.overlays.length === 0) {
    const id = frameId(frame);
    return { xml: alternate(context, frame, plan.plotId, id, name, alt), shapeId: id };
  }

  return groupedChartXml(context, plan, { frame, rect, name, alt });
}

/**
 * Adds a chart's part and its embedded workbook to the package, and relates the slide to the chart.
 *
 * @param context - The package and the slide.
 * @param model - The chart's data.
 * @returns The slide's relationship id for the chart.
 */
function addChartParts(context: ChartFrameContext, model: NativeChartModel): string {
  const number = chartNumber(context.pkg);
  const chartPath = `ppt/charts/chart${number}.xml`;
  const workbookPath = `ppt/embeddings/Microsoft_Excel_Worksheet${number}.xlsx`;
  context.pkg.addPart(workbookPath, chartWorkbook(model));
  const workbookId = context.pkg.relate(chartPath, REL.package, workbookPath);
  context.pkg.addPart(
    chartPath,
    chartXml(model, workbookId, { theme: context.theme }),
    CONTENT_TYPE.chart,
  );
  return context.pkg.relate(context.path, REL.chart, chartPath);
}

/**
 * The graphic frame that holds a native chart.
 *
 * @param context - The slide's ids.
 * @param node - The chart.
 * @param relId - The slide's relationship id for the chart.
 * @param name - The chart's selection-pane name.
 * @param rect - Where the frame sits: the plot, or the chart when there is no plot.
 */
function chartFrameXml(
  context: ChartFrameContext,
  node: ChartNode,
  relId: string,
  name: string,
  rect: SceneRect,
): string {
  return el(
    'p:graphicFrame',
    {},
    el(
      'p:nvGraphicFramePr',
      {},
      cNvPr(context.nextId(), name, { descr: node.chart.summary || node.chart.name }),
      el('p:cNvGraphicFramePr', {}, el('a:graphicFrameLocks', { noGrp: 1 })),
      el('p:nvPr'),
    ),
    xfrm(rect, 'p:xfrm'),
    el(
      'a:graphic',
      {},
      el(
        'a:graphicData',
        { uri: CHART_URI },
        el('c:chart', { 'xmlns:c': CHART_NAMESPACE, 'r:id': relId }),
      ),
    ),
  );
}

/**
 * The parts of a chart that is drawn with overlays: the frame and what it is drawn with.
 */
type ChartParts = {
  /**
   * The graphic frame of the native chart.
   */
  frame: string;

  /**
   * Where the chart sits.
   */
  rect: SceneRect;

  /**
   * The selection-pane name of the chart.
   */
  name: string;

  /**
   * The alt text of the chart.
   */
  alt: string;
};

/**
 * A native chart with overlays: the overlays drawn behind the frame, then the front ones, grouped
 * with it, under one alternate-content fallback.
 *
 * @param context - The slide's ids and fallback writer.
 * @param plan - The chart's plan, with its overlays.
 * @param parts - The chart's frame and its name and alt text.
 */
function groupedChartXml(
  context: ChartFrameContext,
  plan: ChartPlan,
  parts: ChartParts,
): WrittenChart {
  const behind = plan.overlays.filter((overlay) => overlay.behind);
  const front = plan.overlays.filter((overlay) => !overlay.behind);
  const children = [
    ...behind.map((overlay) => overlayXml(overlay, context)),
    parts.frame,
    ...front.map((overlay) => overlayXml(overlay, context)),
  ].filter((child) => child !== '');
  const bounds = unionRects([
    parts.rect,
    ...plan.overlays.map((overlay) => overlayRect(overlay.item)),
  ]);
  const groupId = context.nextId();
  const group = groupXml(children, bounds, parts.name, () => groupId);
  return {
    xml: alternate(context, group, plan.plotId, groupId, parts.name, parts.alt),
    shapeId: groupId,
  };
}

/**
 * A native chart as alternate content with a picture of the web's plot as the fallback, both with
 * the same shape id so animations find either; the chart alone when there is no picture.
 *
 * @param context - The fallback writer.
 * @param chart - The chart's markup.
 * @param plotId - The plot's scene node id.
 * @param id - The chart's shape id.
 * @param name - The chart's name.
 * @param alt - Its alt text.
 */
function alternate(
  context: ChartFrameContext,
  chart: string,
  plotId: number | null,
  id: number | null,
  name: string,
  alt: string,
): string {
  const picture =
    context.fallback === null || plotId === null || id === null
      ? ''
      : context.fallback(plotId, id, name, alt);
  if (picture === '') {
    return chart;
  }

  return el(
    'mc:AlternateContent',
    { 'xmlns:mc': MC_NAMESPACE },
    el(
      'mc:Choice',
      {
        [`xmlns:${ALTERNATE_NAMESPACE.prefix}`]: ALTERNATE_NAMESPACE.uri,
        Requires: ALTERNATE_NAMESPACE.prefix,
      },
      chart,
    ),
    el('mc:Fallback', {}, picture),
  );
}

/**
 * The selection-pane name of a chart: `Chart: <its name>`.
 *
 * @param node - The chart.
 */
export function chartName(node: ChartNode): string {
  return node.chart.name === '' ? `Chart ${node.id}` : `Chart: ${node.chart.name}`;
}

/**
 * The plan of a chart, for callers that only need the decision.
 *
 * @param node - The chart.
 * @param scene - The slide's scene.
 * @param mode - The export mode.
 */
export function chartPlanOf(
  node: ChartNode,
  scene: Pick<SlideScene, 'nodes' | 'tree'>,
  mode: ExportMode,
): ChartPlan {
  return planChart(node, scene, mode);
}

/**
 * The shape id in a graphic frame's markup.
 *
 * @param xml - The frame.
 */
function frameId(xml: string): number | null {
  const match = FRAME_ID_PATTERN.exec(xml);
  return match === null ? null : Number(match[1]);
}

/**
 * One overlay: a text box for text, a shape for everything else.
 *
 * @param overlay - The overlay.
 * @param context - The slide's theme and ids.
 */
function overlayXml(overlay: ChartOverlay, context: ChartFrameContext): string {
  const { item } = overlay;
  return item.text === null ? overlayShapeXml(item, context) : overlayTextXml(item, context);
}

/**
 * A chart text drawn as a text box: no wrapping, no insets, anchored where the web anchored it.
 *
 * @param item - The text item.
 * @param context - The slide's theme and ids.
 */
function overlayTextXml(item: ChartSvgItem, context: ChartFrameContext): string {
  const text = item.text;
  if (text === null) {
    return '';
  }

  const rect = overlayRect(item);
  return el(
    'p:sp',
    {},
    el(
      'p:nvSpPr',
      {},
      cNvPr(
        context.nextId(),
        `Chart label: ${text.lines.join(' ')}`.slice(0, LABEL_NAME_MAX_CHARS),
      ),
      el('p:cNvSpPr', { txBox: 1 }),
      el('p:nvPr'),
    ),
    el('p:spPr', {}, xfrm(rect), el('a:prstGeom', { prst: 'rect' }, el('a:avLst')), el('a:noFill')),
    el(
      'p:txBody',
      {},
      el(
        'a:bodyPr',
        { wrap: 'none', lIns: 0, tIns: 0, rIns: 0, bIns: 0, rtlCol: 0, anchor: 't', anchorCtr: 0 },
        el('a:noAutofit'),
      ),
      el('a:lstStyle'),
      ...textParagraphsXml(text, context),
    ),
  );
}

/**
 * The paragraphs of a chart label: one per line, aligned as the web anchored the text, at the web's
 * line height, with the run properties every line shares.
 *
 * @param text - The label's text.
 * @param context - The slide's theme.
 */
function textParagraphsXml(text: ChartSvgText, context: ChartFrameContext): string[] {
  const align = { start: 'l', middle: 'ctr', end: 'r' }[text.anchor];
  const properties = el(
    'a:rPr',
    {
      lang: 'en-US',
      sz: fontSizeHundredths(text.size),
      b: text.weight >= BOLD_FONT_WEIGHT ? 1 : 0,
      dirty: 0,
    },
    el('a:solidFill', {}, colorXml(text.color, context.theme)),
    el('a:latin', { typeface: chartTypeface(text.family, { theme: context.theme }) }),
  );
  return text.lines.map((line) =>
    el(
      'a:p',
      {},
      el(
        'a:pPr',
        { algn: align },
        el('a:lnSpc', {}, el('a:spcPts', { val: pointsHundredths(text.lineHeight) })),
        el('a:spcBef', {}, el('a:spcPts', { val: 0 })),
        el('a:buNone'),
      ),
      el('a:r', {}, properties, el('a:t', {}, escapeXml(line))),
    ),
  );
}

/**
 * A chart shape (a legend chip, a leader line, an annotation, a gridline the native chart does not
 * draw) as a free-form shape.
 *
 * @param item - The shape item.
 * @param context - The slide's theme and ids.
 */
function overlayShapeXml(item: ChartSvgItem, context: ChartFrameContext): string {
  const bounds = pathBounds(item.commands);
  if (bounds === null || (item.fill === null && item.stroke === null)) {
    return '';
  }

  const box = {
    ...bounds,
    width: Math.max(bounds.width, MIN_DRAWN_PX),
    height: Math.max(bounds.height, MIN_DRAWN_PX),
  };
  const fill =
    item.fill === null ? el('a:noFill') : el('a:solidFill', {}, colorXml(item.fill, context.theme));
  return el(
    'p:sp',
    {},
    el('p:nvSpPr', {}, cNvPr(context.nextId(), `Chart ${item.tag}`), el('p:cNvSpPr'), el('p:nvPr')),
    el(
      'p:spPr',
      {},
      xfrm(box),
      customGeometry(item.commands, box, false, { fill: item.fill !== null }),
      fill,
      overlayLineXml(item, context),
    ),
  );
}

/**
 * The outline of an overlay shape: none, or its stroke, with its dash pattern and caps.
 *
 * @param item - The shape item.
 * @param context - The slide's theme.
 */
function overlayLineXml(item: ChartSvgItem, context: ChartFrameContext): string {
  if (item.stroke === null) {
    return el('a:ln', {}, el('a:noFill'));
  }

  const strokeWidth = Math.max(item.strokeWidth, MIN_DRAWN_PX);
  const dash =
    item.dash === null
      ? el('a:prstDash', { val: 'solid' })
      : el(
          'a:custDash',
          {},
          ...pairs(item.dash).map(([dashLength, space]) =>
            el('a:ds', {
              d: Math.round((dashLength / strokeWidth) * DASH_UNITS),
              sp: Math.round((space / strokeWidth) * DASH_UNITS),
            }),
          ),
        );
  return el(
    'a:ln',
    {
      w: pxToEmu(item.strokeWidth),
      cap: { butt: 'flat', round: 'rnd', square: 'sq' }[item.cap],
    },
    el('a:solidFill', {}, colorXml(item.stroke, context.theme)),
    dash,
    el('a:round'),
  );
}

/**
 * Dash and space pairs of a dash pattern (an odd list repeats, as in SVG).
 *
 * @param dash - The pattern.
 */
function pairs(dash: readonly number[]): [number, number][] {
  const list = dash.length % 2 === 1 ? [...dash, ...dash] : [...dash];
  const result: [number, number][] = [];
  for (let index = 0; index + 1 < list.length; index += 2) {
    result.push([list[index] ?? 0, list[index + 1] ?? 0]);
  }

  return result;
}

/**
 * The box an overlay takes: a text's estimated box around its anchor, or a shape's bounds.
 *
 * @param item - The item.
 */
function overlayRect(item: ChartSvgItem): SceneRect {
  const text = item.text;
  if (text === null) {
    return pathBounds(item.commands) ?? { x: 0, y: 0, width: 0, height: 0 };
  }

  const longest = maxOf(text.lines.map((line) => Array.from(line).length));
  const width = longest * text.size * CHARACTER_EM + text.size;
  const shift = { start: 0, middle: width / 2, end: width }[text.anchor];
  const left = text.x - shift;
  return {
    x: left,
    y: text.y - text.lineHeight / 2,
    width,
    height: text.lineHeight * text.lines.length,
  };
}

/**
 * The smallest rectangle around several.
 *
 * @param rects - The rectangles.
 */
function unionRects(rects: readonly SceneRect[]): SceneRect {
  const left = minOf(rects.map((rect) => rect.x));
  const top = minOf(rects.map((rect) => rect.y));
  const right = maxOf(rects.map((rect) => rect.x + rect.width));
  const bottom = maxOf(rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * The next free chart number in the package.
 *
 * @param pkg - The package.
 */
function chartNumber(pkg: OpcPackage): number {
  let number = 1;
  while (pkg.has(`ppt/charts/chart${number}.xml`)) {
    number += 1;
  }

  return number;
}
