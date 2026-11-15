import { CHART_SPEC_ATTRIBUTE, CHART_SPEC_VERSION, parseChartSpec } from '@deckster/kit/chart-spec';

import type {
  CollectedNode,
  CollectedScene,
  CollectedSpec,
  CollectedSvg,
} from '#scene/collected.ts';
import type {
  BoxNode,
  ChartNode,
  DiagramNode,
  SceneNode,
  SlideScene,
  SvgNode,
} from '#scene/scene.ts';

import { decodeDiagramDescription } from '#diagram/decode-diagram.ts';
import { clipToRoundedBox, toVectorShape } from '#vector/svg-path.ts';

/**
 * Turns what the page collected into a scene description: chart and diagram descriptions are
 * decoded (an unreadable one becomes a figure the planner rasterises, with a warning), SVG geometry
 * is converted to absolute paths in canvas pixels, and frontmatter text that a layout's
 * placeholders read is attached.
 *
 * @param collected - What `collectScene` returned.
 * @param fieldText - Frontmatter text by placeholder kind, such as `{ title: '...' }` for a layout
 *   that does not render its title.
 * @returns The scene; never fails.
 */
export function finishScene(
  collected: CollectedScene,
  fieldText: Readonly<Record<string, string>>,
): SlideScene {
  const warnings = [...collected.warnings];
  const nodes = collected.nodes.map((node) => finishNode(node, warnings));
  return {
    canvas: collected.canvas,
    surface: collected.surface,
    layout: collected.layout,
    background: collected.background,
    backgroundIsImage: collected.backgroundIsImage,
    nodes,
    links: collected.links,
    fieldText: { ...fieldText },
    warnings,
    tree: collected.tree,
  };
}

/**
 * One collected node as a scene node.
 *
 * @param node - The collected node.
 * @param warnings - Collects problems with descriptions.
 */
function finishNode(node: CollectedNode, warnings: string[]): SceneNode {
  switch (node.kind) {
    case 'svg': {
      return finishSvg(node);
    }

    case 'chart-spec': {
      return finishChartSpec(node, warnings);
    }

    case 'diagram-spec': {
      return finishDiagramSpec(node, warnings);
    }

    case 'box':
    case 'image':
    case 'media':
    case 'table':
    case 'text': {
      return node;
    }
  }
}

/**
 * An inline SVG with its shapes in canvas pixels, clipped to its rounded box where it has one.
 *
 * @param node - The collected SVG.
 */
function finishSvg(node: CollectedSvg): SvgNode {
  const shapes = node.shapes?.flatMap((raw) => {
    const shape = toVectorShape(raw);
    return shape === null ? [] : [shape];
  });
  const clipped =
    shapes === undefined || node.radii === undefined
      ? shapes
      : clipToRoundedBox(shapes, node.rect, node.radii);
  return { ...node, shapes: clipped ?? null };
}

/**
 * A chart as a chart node, or as a picture when its description is not one this version reads.
 *
 * @param node - The collected chart description.
 * @param warnings - Collects the problem.
 */
function finishChartSpec(node: CollectedSpec, warnings: string[]): ChartNode | BoxNode {
  const chart = parseChartSpec(node.spec);
  if (chart === undefined) {
    const why = `${CHART_SPEC_ATTRIBUTE} is not a version ${CHART_SPEC_VERSION} chart spec`;
    warnings.push(`${node.selector}: ${why}; the chart is exported as a picture.`);
    return undescribedFigure(node, why);
  }

  const { spec: _spec, ...base } = node;
  return { ...base, kind: 'chart', chart };
}

/**
 * A diagram as a diagram node, or as a picture when its description does not decode.
 *
 * @param node - The collected diagram description.
 * @param warnings - Collects the problem.
 */
function finishDiagramSpec(node: CollectedSpec, warnings: string[]): DiagramNode | BoxNode {
  const diagram = decodeDiagramDescription(node.spec);
  if (typeof diagram === 'string') {
    warnings.push(`${node.selector}: ${diagram}; the diagram is exported as a picture.`);
    return undescribedFigure(node, diagram);
  }

  const { spec: _spec, ...base } = node;
  return { ...base, kind: 'diagram', diagram };
}

/**
 * A chart or diagram whose description could not be read: a box the planner rasterises whole.
 *
 * @param node - The collected node.
 * @param why - Why the description was unreadable.
 */
function undescribedFigure(node: CollectedSpec, why: string): BoxNode {
  const { spec: _spec, kind: _kind, ...base } = node;
  return {
    ...base,
    kind: 'box',
    hints: [...base.hints, { reason: 'figure', scope: 'subtree', detail: why }],
    fill: null,
    borders: [null, null, null, null],
    radii: [0, 0, 0, 0],
    shadows: [],
    fullBleed: false,
  };
}
