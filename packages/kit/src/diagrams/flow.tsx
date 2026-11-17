import { useReadyHold, useSlide, useStatic, useStep } from '@deckster/engine';
import { useId, useMemo, useRef, type ReactNode } from 'react';

import type { AutoPositions } from '#diagrams/elk-layout.ts';
import type { FlowMetrics } from '#diagrams/flow-grid.ts';
import type { RoutedEdge } from '#diagrams/flow-route.ts';
import type { AutoLayout, FlowDirection, FlowNodeSpec, FlowSpec } from '#diagrams/flow-spec.ts';
import type { Point, Side } from '#diagrams/geometry.ts';

import { StepMarks } from '#code/step-marks.tsx';
import { flowFrame, flowSteps } from '#diagrams/choreography.ts';
import { flag } from '#diagrams/data-flags.ts';
import { describeDiagram, type DescribeInput } from '#diagrams/describe-diagram.ts';
import { DiagramFrame } from '#diagrams/diagram-frame.tsx';
import { LABEL_MAX_CHARS } from '#diagrams/diagram-limits.ts';
import { flowLiveNote, flowSummary } from '#diagrams/diagram-summary.ts';
import {
  edgeCornerRadius,
  FALLBACK,
  useDiagramTokens,
  useReducedMotion,
  type DiagramTokens,
} from '#diagrams/diagram-tokens.ts';
import { placeBadges } from '#diagrams/flow-badges.ts';
import { parseFlowChildren, type NodeExtras, type ParsedFlow } from '#diagrams/flow-children.ts';
import { EdgeLabel, EdgePath } from '#diagrams/flow-edge-view.tsx';
import {
  cellsFromCentres,
  columnSizes,
  gridSize,
  groupDepth,
  NARROW_NODE_WIDTH,
  placeAtCentres,
} from '#diagrams/flow-grid.ts';
import { labelBox, labelLines } from '#diagrams/flow-labels.ts';
import { layoutFlow, type EdgeLayout, type FlowLayout } from '#diagrams/flow-layout.ts';
import { NodeBadge, NodeBody, NodeShadow, NodeShape } from '#diagrams/flow-node-view.tsx';
import {
  PacketDots,
  PacketTags,
  packetScene,
  type PacketDot,
  type PacketTag,
} from '#diagrams/flow-packets.tsx';
import { optional } from '#diagrams/flow-spec-builder.ts';
import { validateFlow } from '#diagrams/flow-validate.ts';
import { resolveCard, type ResolvedCard } from '#diagrams/node-cards.ts';
import { NODE_KINDS } from '#diagrams/node-kinds.ts';
import { cardShape, nodeGeometry, roundRect } from '#diagrams/node-shapes.ts';
import { movesAt } from '#diagrams/packet-motion.ts';
import { useAutoLayout, type AutoCandidate } from '#diagrams/use-auto-layout.ts';
import { useDiagramDescription } from '#diagrams/use-description.ts';
import { useElementSize } from '#diagrams/use-element-size.ts';
import { useKindIcons } from '#diagrams/use-kind-icons.ts';
import { useMeasurements } from '#diagrams/use-measurements.ts';
import { useMotionPlans } from '#diagrams/use-motion-plans.ts';
import { widestWord } from '#diagrams/word-breaks.ts';
import { maxOf } from '#foundation/lists.ts';

/**
 * Props of {@link Flow}.
 */
export type FlowProps = {
  /**
   * An id for the diagram, used in its export description.
   */
  id?: string;

  /**
   * What the diagram shows, in a few words: its accessible name. The text summary of nodes and
   * connections is added for screen readers.
   */
  title: string;

  /**
   * Columns the grid has at least; the cells used decide otherwise.
   */
  cols?: number;

  /**
   * Rows the grid has at least.
   */
  rows?: number;

  /**
   * The automatic layout used when no node has a grid cell: `layered` (the default), `tree`,
   * `force` or `radial`.
   */
  layout?: AutoLayout;

  /**
   * Which way an automatic layout flows: `right` (the default), `down`, `left` or `up`.
   */
  direction?: FlowDirection;

  /**
   * A fixed height in canvas pixels; without it the diagram fills its region.
   */
  height?: number;

  /**
   * The card (a node style the brand defines) for every node of the diagram: `default`, `outline`,
   * `solid`, `tint`, `raised` or one of the brand's own. A node's own `card` wins over it.
   */
  card?: string;

  /**
   * The automatic layout, computed by the build for MDX slides; never written by hand.
   */
  positions?: AutoPositions;

  /**
   * `<Node>`, `<Group>`, `<Edge>`, `<Packet>`, `<Journey>`, `<State>` and `<Focus>` elements.
   */
  children?: ReactNode;
};

/**
 * Node height used before the first measurement, as a multiple of the caption size.
 */
const ESTIMATED_NODE_HEIGHT = 4;

/**
 * The widest a node gets, in caption sizes.
 */
const NODE_MAX_CAPTIONS = 14;

/**
 * Pixels of room kept beyond a measured word, for the canvas's measure of a variable font.
 */
const WORD_SLACK = 6;

/**
 * The characters a label between two columns keeps room for however much the nodes widen.
 */
const SHORT_LABEL_CHARS = 10;

/**
 * Room between a label in a gutter and the nodes on each side, in pixels.
 */
const LABEL_GUTTER_CLEARANCE = 14;

/**
 * Text whose average character width sets how wide an edge label may get.
 */
const LABEL_SAMPLE = 'the quick brown fox jumps over the lazy dog';

/**
 * The narrowest a node gets, in caption sizes.
 */
const NODE_MIN_CAPTIONS = 7;

/**
 * The line height of a group's label, as a multiple of the label size.
 */
const GROUP_LABEL_LINE = 1.3;

/**
 * The gap an edge leaves before its arrowhead, in regular strokes.
 */
const ARROW_GAP_STROKES = 1.5;

/**
 * The share of the gutter between rows that a stacked automatic layout counts toward its height.
 */
const ROW_GUTTER_SHARE = 0.6;

/**
 * The characters an id generated from `useId` may contain beyond letters and digits; they are
 * dropped.
 */
const NON_ID_CHARACTERS = /[^a-z0-9]/gi;

/**
 * A diagram of nodes and edges, drawn in the brand's diagram colors and type, filling the space it
 * is given. Place nodes on a grid with `col` and `row` (spans for wide or tall nodes), or leave the
 * cells out for an automatic layout (ELK, loaded only on slides that use it). Edges route around
 * nodes with rounded corners; packets, journeys, state changes and focus are choreographed by slide
 * step, animate while the slide is on screen and freeze into a meaningful still in static mode and
 * exports. The diagram carries a text summary for screen readers and a serialisable description
 * (`data-diagram-description`) for native exports.
 *
 * ```mdx
 * <Flow title="Checkout request path">
 *   <Node id="web" kind="client" title="Web app" col={1} row={1} />
 *   <Node id="api" kind="service" title="Orders API" col={2} row={1} />
 *   <Node id="db" kind="database" title="Orders DB" col={3} row={1} />
 *   <Edge from="web" to="api" label="HTTPS" />
 *   <Edge from="api" to="db" label="SQL" />
 *   <Journey at={1} path="web api db" back />
 * </Flow>
 * ```
 *
 * @throws Error naming the element and the fix when the declaration is invalid: an unknown node id,
 *   overlapping cells, a node outside its group.
 */
export function Flow({
  id,
  title,
  cols,
  rows,
  layout: algorithm = 'layered',
  direction = 'right',
  height,
  positions,
  card,
  children,
}: FlowProps): ReactNode {
  const parsed = useMemo(() => parseFlowChildren(children), [children]);
  return (
    <FlowView
      parsed={parsed}
      kind="flow"
      title={title}
      algorithm={algorithm}
      direction={direction}
      {...optional('id', id)}
      {...optional('cols', cols)}
      {...optional('rows', rows)}
      {...optional('height', height)}
      {...optional('positions', positions)}
      {...optional('card', card)}
    />
  );
}

/**
 * Props of {@link FlowView}.
 */
export type FlowViewProps = {
  /**
   * The declaration and the nodes' icons and content.
   */
  parsed: ParsedFlow;

  /**
   * The component drawing it, for `data-diagram` and the description.
   */
  kind: 'flow' | 'tree' | 'cycle';

  /**
   * The accessible name.
   */
  title: string;

  /**
   * An id for the description.
   */
  id?: string;

  /**
   * Columns the grid has at least.
   */
  cols?: number;

  /**
   * Rows the grid has at least.
   */
  rows?: number;

  /**
   * The automatic layout for nodes without cells.
   */
  algorithm: AutoLayout;

  /**
   * Which way an automatic layout flows.
   */
  direction: FlowDirection;

  /**
   * A fixed height in canvas pixels.
   */
  height?: number;

  /**
   * Node centres a form computes itself (a cycle's ring); they replace the automatic layout.
   */
  centres?: ReadonlyMap<string, Point>;

  /**
   * Node sides where every edge meets one point (a tree's parent above its children).
   */
  tips?: ReadonlyMap<string, ReadonlySet<Side>>;

  /**
   * Redraws the routed edges, for forms whose edges follow their own shape (a cycle's arcs, a
   * tree's buses), with the brand's values for corner radii and arrow gaps.
   */
  reshape?: (layout: EdgeLayout, tokens: DiagramTokens) => ReadonlyMap<string, RoutedEdge>;

  /**
   * The automatic layout the build computed.
   */
  positions?: AutoPositions;

  /**
   * The card for every node that names none of its own.
   */
  card?: string;
};

/**
 * Lays out, choreographs and draws a parsed diagram: what `<Flow>` renders, and what `<Tree>` and
 * `<Cycle>` render with their own placement.
 */
export function FlowView({
  parsed,
  kind,
  title,
  id,
  cols,
  rows,
  algorithm,
  direction,
  height,
  centres: fixedCentres,
  tips,
  reshape,
  positions,
  card,
}: FlowViewProps): ReactNode {
  const specKey = JSON.stringify(parsed.spec);
  const spec = useMemo(() => validSpec(specKey), [specKey]);
  const kindIcons = useKindIcons(
    spec.nodes.map((node) => {
      const extra = parsed.extras.get(node.id);
      return {
        kind: node.kind,
        settled:
          extra?.icon !== undefined || extra?.iconless === true || extra?.content !== undefined,
      };
    }),
  );
  const extras = useMemo(
    () => withKindIcons(spec, parsed.extras, kindIcons),
    [spec, parsed.extras, kindIcons],
  );
  const step = useStep();
  const isStatic = useStatic();
  const { isActive } = useSlide();
  const root = useRef<HTMLElement | null>(null);
  const size = useElementSize(root);
  const tokens = useDiagramTokens(root);
  const cards = useMemo(() => nodeCards(spec, tokens ?? FALLBACK, card), [spec, tokens, card]);
  const metrics = useMemo(
    () => (tokens === undefined ? undefined : flowMetrics(tokens, spec, cards)),
    [tokens, spec, cards],
  );
  const isAuto = spec.nodes.length > 0 && spec.nodes.every((node) => node.cell === undefined);
  const grid = gridSize(
    spec.nodes.flatMap((node) => (node.cell === undefined ? [] : [node.cell])),
    { ...(cols === undefined ? {} : { cols }), ...(rows === undefined ? {} : { rows }) },
  );
  const nodeWidth = singleNodeWidth(size, metrics, isAuto ? undefined : grid.cols, spec);
  const measurements = useMeasurements(
    root,
    `${specKey}|${Math.round(nodeWidth)}|${[...cards.values()].map((one) => one.name).join(' ')}`,
  );
  const measured = useMemo(
    () =>
      metrics === undefined
        ? undefined
        : { ...metrics, nodeHeight: measurements?.nodeHeight ?? metrics.nodeHeight },
    [metrics, measurements],
  );
  const candidates = useAutoLayout(
    isAuto && fixedCentres === undefined && measured !== undefined && measurements !== undefined
      ? {
          spec,
          key: specKey,
          size: { width: measured.nodeMaxWidth, height: measured.nodeHeight },
          algorithm,
          direction,
          spacing: measured.gutterY,
          ...optional('positions', positions),
        }
      : undefined,
  );
  const chosen = useMemo(
    () =>
      candidates === undefined || size === undefined || measured === undefined
        ? undefined
        : fittingCandidate(candidates, size, measured, algorithm),
    [candidates, size, measured, algorithm],
  );
  const centres = fixedCentres ?? chosen?.centres;
  const snap = fixedCentres === undefined && (algorithm === 'layered' || algorithm === 'tree');
  const layout = useMemo(() => {
    if (size === undefined || measured === undefined || tokens === undefined) {
      return undefined;
    }

    const laidOut = layoutFlow({
      spec,
      size,
      metrics: measured,
      route: {
        margin: tokens.space.md,
        radius: edgeCornerRadius(tokens, tokens.radius.lg),
        portSpacing: tokens.space.md,
        arrowGap: tokens.edge.stroke * ARROW_GAP_STROKES,
      },
      grid: { cols: grid.cols, rows: grid.rows },
      ...(centres === undefined ? {} : { centres, snap }),
      ...(measurements === undefined ? {} : { nodeHeights: measurements.nodeHeights }),
      ...(tips === undefined ? {} : { tips }),
      shapes: new Map(
        spec.nodes.map((node) => [
          node.id,
          cardShape(NODE_KINDS[node.kind].shape, cardOf(cards, node).tokens.shape),
        ]),
      ),
      labels: measurements?.labels ?? new Map(),
      groupLabels: measurements?.groupLabels ?? new Map(),
      ...(reshape === undefined ? {} : { reshape: (edges: EdgeLayout) => reshape(edges, tokens) }),
    });
    return laidOut;
  }, [
    size,
    measured,
    tokens,
    spec,
    grid.cols,
    grid.rows,
    centres,
    snap,
    measurements,
    tips,
    reshape,
    cards,
  ]);
  const ready =
    layout !== undefined && measurements !== undefined && (!isAuto || centres !== undefined);
  useReadyHold(!ready);
  const frame = useMemo(() => flowFrame(spec, step), [spec, step]);
  const reduced = useReducedMotion();
  const still = isStatic || reduced || !movesAt(tokens?.motion);
  const scene = useMemo(
    () =>
      layout === undefined || tokens === undefined
        ? undefined
        : packetScene(
            spec,
            frame,
            layout.edges,
            tokens.motion,
            still,
            [...layout.labels.values()].map((label) => label.rect),
            [...layout.nodes.values()],
          ),
    [spec, frame, layout, tokens, still],
  );
  useMotionPlans(root, scene?.plans ?? NO_PLANS, ready && isActive && !still);
  const stillScene = useMemo(
    () =>
      layout === undefined || tokens === undefined || still
        ? scene
        : packetScene(
            spec,
            frame,
            layout.edges,
            tokens.motion,
            true,
            [...layout.labels.values()].map((label) => label.rect),
            [...layout.nodes.values()],
          ),
    [spec, frame, layout, tokens, still, scene],
  );
  const summary = flowSummary(spec, frame, layout?.nodes);
  const generatedId = useId();
  const diagramId = id ?? `${kind}-${generatedId.replace(NON_ID_CHARACTERS, '')}`;
  useDiagramDescription(
    root,
    !ready || layout === undefined
      ? undefined
      : () =>
          describeDiagram(
            flowParts({
              element: root.current as HTMLElement,
              kind,
              id: diagramId,
              spec,
              cards,
              layout,
              frame,
              summary,
              packets: stillScene?.dots ?? [],
              tags: stillScene?.tags ?? [],
            }),
          ),
  );
  const edgeTitles = edgeNames(spec);
  const labelWidths = useMemo(() => {
    if (metrics === undefined || tokens === undefined || size === undefined) {
      return new Map<string, number>();
    }

    return labelWidthsOf(spec, metrics, tokens, isAuto ? undefined : size.width, grid.cols);
  }, [spec, metrics, tokens, size, isAuto, grid.cols]);
  const longText =
    layout === undefined || tokens === undefined
      ? []
      : longTextOf(spec, cards, layout, tokens, labelWidths);
  return (
    <DiagramFrame
      ref={root}
      kind={kind}
      title={title}
      summary={summary}
      ready={ready}
      height={height}
      live={flowLiveNote(spec, frame)}
      data={flowDataAttributes({
        diagramId,
        frame,
        layout,
        isAuto,
        algorithm,
        direction,
        chosenDirection: chosen?.direction,
        longText,
        edgeTitles,
        nodeTitles: new Map(spec.nodes.map((node) => [node.id, node.title])),
        tokens,
      })}>
      <StepMarks ats={flowSteps(spec)} />
      {layout === undefined || tokens === undefined ? null : (
        <FlowDrawing
          spec={spec}
          cards={cards}
          layout={layout}
          frame={frame}
          tokens={tokens}
          scene={scene}
          still={still}
          extras={extras}
          labelWidths={labelWidths}
        />
      )}
      {layout === undefined || layout.nodes.size === 0 ? (
        <MeasureNodes spec={spec} cards={cards} extras={extras} width={nodeWidth} />
      ) : null}
    </DiagramFrame>
  );
}

/**
 * No animations.
 */
const NO_PLANS: readonly never[] = [];

/**
 * What a flow's frame carries as `data-*` attributes: its counts, how it was laid out, and the
 * overlaps and broken text `deck lint` reads.
 *
 * @param input - The flow's state at this step.
 */
function flowDataAttributes(input: FlowDataInput): Record<string, string | undefined> {
  const { frame, layout, isAuto, algorithm, direction, chosenDirection, longText, edgeTitles } =
    input;
  return {
    'data-diagram-id': input.diagramId,
    'data-diagram-nodes': String(visibleCount(frame.nodes)),
    'data-diagram-edges': String(visibleCount(frame.edges)),
    'data-diagram-cramped': layout?.cramped === true ? 'true' : undefined,
    'data-diagram-layout': isAuto ? algorithm : 'grid',
    'data-diagram-direction': isAuto ? (chosenDirection ?? direction) : undefined,
    'data-diagram-overlap':
      layout === undefined || layout.overlaps.length === 0
        ? undefined
        : layout.overlaps.map(([a, b]) => `${a} and ${b}`).join('; '),
    'data-diagram-long-text': longText.length === 0 ? undefined : longText.join('; '),
    'data-diagram-badge-overlap': badgeOverlapOf(input),
    'data-diagram-edge-overlap':
      layout === undefined || layout.edgeOverlaps.length === 0
        ? undefined
        : layout.edgeOverlaps
            .map(([a, b]) => `${edgeTitles.get(a) ?? a} and ${edgeTitles.get(b) ?? b}`)
            .join('; '),
  };
}

/**
 * What {@link flowDataAttributes} reads.
 */
type FlowDataInput = {
  /**
   * The diagram's id.
   */
  diagramId: string;

  /**
   * What the step shows.
   */
  frame: ReturnType<typeof flowFrame>;

  /**
   * Where everything went, once laid out.
   */
  layout: FlowLayout | undefined;

  /**
   * Whether the nodes were placed by an automatic layout.
   */
  isAuto: boolean;

  /**
   * The automatic layout asked for.
   */
  algorithm: AutoLayout;

  /**
   * The direction asked for.
   */
  direction: FlowDirection;

  /**
   * The direction the chosen automatic layout flows, when it turned one.
   */
  chosenDirection: FlowDirection | undefined;

  /**
   * The labels and nodes that are broken or cut.
   */
  longText: readonly string[];

  /**
   * How each edge is named in messages, by id.
   */
  edgeTitles: ReadonlyMap<string, string>;

  /**
   * How each node is named in messages, by id.
   */
  nodeTitles: ReadonlyMap<string, string>;

  /**
   * The brand's values, once read, for the size of badges.
   */
  tokens: DiagramTokens | undefined;
};

/**
 * The badges that still sit on an edge or its arrowhead at this step, because no corner of their
 * node was free, named as the reader sees them (`"Payments" badge on "Orders to Payments"`), for
 * `deck lint`.
 *
 * @param input - The flow's state at this step.
 * @returns The names joined with semicolons, or nothing when every badge is clear.
 */
function badgeOverlapOf(input: FlowDataInput): string | undefined {
  const { layout, tokens, frame, edgeTitles, nodeTitles } = input;
  if (layout === undefined || tokens === undefined) {
    return undefined;
  }

  const covered = [...placeBadges(layout, frame.nodes, frame.edges, tokens)].flatMap(
    ([id, placed]) =>
      placed.covered.map(
        (edge) => `"${nodeTitles.get(id) ?? id}" badge on ${edgeTitles.get(edge) ?? edge}`,
      ),
  );
  return covered.length === 0 ? undefined : covered.join('; ');
}

/**
 * Props of {@link FlowDrawing}.
 */
type FlowDrawingProps = {
  /**
   * The diagram.
   */
  spec: FlowSpec;

  /**
   * Each node's card, by id.
   */
  cards: ReadonlyMap<string, ResolvedCard>;

  /**
   * Where everything goes.
   */
  layout: FlowLayout;

  /**
   * What the step shows.
   */
  frame: ReturnType<typeof flowFrame>;

  /**
   * The brand's values.
   */
  tokens: DiagramTokens;

  /**
   * What moves.
   */
  scene: ReturnType<typeof packetScene> | undefined;

  /**
   * Whether the diagram shows a still.
   */
  still: boolean;

  /**
   * Icons and content by node id.
   */
  extras: ReturnType<typeof parseFlowChildren>['extras'];

  /**
   * The widest each edge label's lines get, in pixels of text, by edge id.
   */
  labelWidths: ReadonlyMap<string, number>;
};

/**
 * The laid-out diagram: groups, edges, packets and node shapes in one SVG, and node text, labels
 * and packet tags in an HTML layer over it.
 */
function FlowDrawing({
  spec,
  cards,
  layout,
  frame,
  tokens,
  scene,
  still,
  extras,
  labelWidths,
}: FlowDrawingProps): ReactNode {
  const { width, height } = layout.size;
  const geometries = new Map(
    spec.nodes.flatMap((node) => {
      const rect = layout.nodes.get(node.id);
      return rect === undefined
        ? []
        : [
            [
              node.id,
              nodeGeometry(NODE_KINDS[node.kind].shape, cardOf(cards, node).tokens, rect),
            ] as const,
          ];
    }),
  );
  const badges = placeBadges(layout, frame.nodes, frame.edges, tokens);
  return (
    <>
      <svg
        className="kit-flow-svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true">
        <g className="kit-flow-groups">
          {spec.groups.map((group) => {
            const box = layout.groups.get(group.id);
            return box === undefined ? null : (
              <path
                key={group.id}
                className="kit-flow-group"
                data-diagram-part="group"
                data-group={group.id}
                data-depth={box.depth}
                data-dashed={flag(tokens.group.dashed)}
                data-visible={String(frame.groups.get(group.id) === true)}
                d={roundRect(box.rect, tokens.group.radius)}
              />
            );
          })}
        </g>
        <g className="kit-flow-shadows">
          {spec.nodes.map((node) => {
            const rect = layout.nodes.get(node.id);
            const geometry = geometries.get(node.id);
            const nodeFrame = frame.nodes.get(node.id);
            return rect === undefined ||
              geometry === undefined ||
              nodeFrame === undefined ? null : (
              <NodeShadow
                key={node.id}
                node={node}
                card={cardOf(cards, node)}
                rect={rect}
                geometry={geometry}
                frame={nodeFrame}
                dimmed={frame.dimmed.has(node.id)}
              />
            );
          })}
        </g>
        <g className="kit-flow-edges">
          {spec.edges.map((edge) => {
            const path = layout.edges.get(edge.id);
            const edgeFrame = frame.edges.get(edge.id);
            return path === undefined || edgeFrame === undefined ? null : (
              <EdgePath
                key={edge.id}
                edge={edge}
                path={path}
                frame={edgeFrame}
                dimmed={frame.dimmed.has(edge.id)}
                stroke={tokens.edge.stroke}
                arrow={tokens.edge.arrow}
              />
            );
          })}
        </g>
      </svg>
      <div className="kit-flow-html">
        {spec.groups.map((group) => {
          const box = layout.groups.get(group.id);
          return (
            <span
              key={group.id}
              className="kit-flow-group-label kit-type-label"
              data-diagram-part="group-label"
              data-measure-group={group.id}
              data-visible={String(frame.groups.get(group.id) === true)}
              style={box === undefined ? undefined : { left: box.label.x, top: box.label.y }}>
              {group.label}
            </span>
          );
        })}
        {spec.edges.map((edge) => {
          const edgeFrame = frame.edges.get(edge.id);
          return edgeFrame === undefined ? null : (
            <EdgeLabel
              key={edge.id}
              edge={edge}
              placed={layout.labels.get(edge.id)}
              frame={edgeFrame}
              dimmed={frame.dimmed.has(edge.id)}
              lines={labelSet(edge.label, tokens, labelWidths.get(edge.id))}
              chip={tokens.label.style === 'chip'}
              step={tokens.label.type}
            />
          );
        })}
      </div>
      <svg
        className="kit-flow-svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true">
        <g className="kit-flow-packets">
          {scene === undefined ? null : <PacketDots dots={scene.dots} />}
        </g>
        <g className="kit-flow-shapes">
          {spec.nodes.map((node) => {
            const rect = layout.nodes.get(node.id);
            const geometry = geometries.get(node.id);
            const nodeFrame = frame.nodes.get(node.id);
            return rect === undefined ||
              geometry === undefined ||
              nodeFrame === undefined ? null : (
              <NodeShape
                key={node.id}
                node={node}
                card={cardOf(cards, node)}
                rect={rect}
                geometry={geometry}
                frame={nodeFrame}
                dimmed={frame.dimmed.has(node.id)}
                arrivalDelay={arrivalOf(scene, still, node.id)}
              />
            );
          })}
        </g>
      </svg>
      <div className="kit-flow-html">
        {spec.nodes.map((node) => {
          const rect = layout.nodes.get(node.id);
          const geometry = geometries.get(node.id);
          const nodeFrame = frame.nodes.get(node.id);
          return rect === undefined || geometry === undefined || nodeFrame === undefined ? null : (
            <NodeBody
              key={node.id}
              node={node}
              card={cardOf(cards, node)}
              extras={extras.get(node.id)}
              rect={rect}
              inset={geometry.inset}
              frame={nodeFrame}
              dimmed={frame.dimmed.has(node.id)}
              arrivalDelay={arrivalOf(scene, still, node.id)}
            />
          );
        })}
        {spec.nodes.map((node) => {
          const rect = layout.nodes.get(node.id);
          const nodeFrame = frame.nodes.get(node.id);
          const placed = badges.get(node.id);
          return rect === undefined || nodeFrame === undefined || placed === undefined ? null : (
            <NodeBadge
              key={node.id}
              node={node}
              rect={rect}
              frame={nodeFrame}
              dimmed={frame.dimmed.has(node.id)}
              corner={placed.corner}
            />
          );
        })}
        {scene === undefined ? null : <PacketTags tags={scene.tags} />}
      </div>
    </>
  );
}

/**
 * Props of {@link MeasureNodes}.
 */
type MeasureNodesProps = {
  /**
   * The diagram.
   */
  spec: FlowSpec;

  /**
   * Each node's card, by id, so a card's title font is measured.
   */
  cards: ReadonlyMap<string, ResolvedCard>;

  /**
   * Icons and content by node id.
   */
  extras: ReturnType<typeof parseFlowChildren>['extras'];

  /**
   * The width nodes will get.
   */
  width: number;
};

/**
 * Renders every node body, hidden, at the width nodes will get, so the first layout knows how tall
 * nodes are.
 */
function MeasureNodes({ spec, cards, extras, width }: MeasureNodesProps): ReactNode {
  const hidden = { visible: false, state: 'default' as const, arrival: false };
  return (
    <div className="kit-flow-html" aria-hidden="true" data-measuring="true">
      {spec.nodes.map((node) => (
        <NodeBody
          key={node.id}
          node={node}
          card={cardOf(cards, node)}
          extras={extras.get(node.id)}
          rect={{ x: 0, y: 0, width, height: 0 }}
          inset={{ top: 0, right: 0, bottom: 0, left: 0 }}
          frame={hidden}
          dimmed={false}
          arrivalDelay={0}
        />
      ))}
    </div>
  );
}

/**
 * The node, gutter and group sizes for a brand: nodes between seven and fourteen caption widths
 * wide, gutters wide enough for the widest label of an edge between two columns to sit beside its
 * line (labels are measured in the brand's font and wrap past {@link LABEL_MAX_CHARS} characters,
 * so one long label cannot push the nodes to their minimum), groups padded by the medium space.
 *
 * @param tokens - The brand's values.
 * @param spec - The diagram, for its edge labels.
 * @param cards - Each node's card, by id, for its title font and shape; today's node without one.
 */
export function flowMetrics(
  tokens: DiagramTokens,
  spec: FlowSpec,
  cards?: ReadonlyMap<string, ResolvedCard>,
): FlowMetrics & { labelMaxWidth: number } {
  const { caption } = tokens.type;
  const padding = 2 * tokens.space.xs;
  const labelMaxWidth =
    tokens.measureEdgeLabel(LABEL_SAMPLE) * (LABEL_MAX_CHARS / LABEL_SAMPLE.length);
  const widest = maxOf(
    spec.edges
      .filter((edge) => edge.label !== undefined && runsAcross(edge, spec))
      .map((edge) => labelBox(edge.label ?? '', tokens.measureEdgeLabel, labelMaxWidth).width),
    0,
  );
  const labelRoom = widest === 0 ? 0 : widest + padding + 2 * LABEL_GUTTER_CLEARANCE;
  const shortLabel = tokens.measureEdgeLabel(LABEL_SAMPLE.slice(0, SHORT_LABEL_CHARS));
  return {
    wordWidths: wordWidthsOf(tokens, spec, cards),
    ...(widest === 0 ? {} : { labelGutterMin: shortLabel + padding + 2 * LABEL_GUTTER_CLEARANCE }),
    nodeMinWidth: caption * NODE_MIN_CAPTIONS,
    nodeMaxWidth: caption * NODE_MAX_CAPTIONS,
    nodeHeight: caption * ESTIMATED_NODE_HEIGHT,
    gutterX: Math.max(tokens.space.xl, labelRoom),
    minGutterX: Math.max(tokens.space.lg, 2 * tokens.space.md),
    gutterY: tokens.space.xl,
    groupPadding: tokens.space.md,
    groupLabel: tokens.type.label * GROUP_LABEL_LINE + tokens.space.xs,
    labelMaxWidth: labelMaxWidth + padding,
  };
}

/**
 * The lines a label sets at its width, or the whole label on one line without a width.
 *
 * @param label - The label.
 * @param tokens - The brand's values, for the caption measure.
 * @param width - The widest its lines get.
 */
function labelSet(
  label: string | undefined,
  tokens: DiagramTokens,
  width: number | undefined,
): string[] | undefined {
  return label === undefined || width === undefined || width <= 0
    ? undefined
    : labelLines(label, tokens.measureEdgeLabel, width);
}

/**
 * The widest each edge label's lines get: the brand's label width, or for a label between two
 * columns of a grid the gutter those columns are left with (after nodes widened for their words),
 * whichever is narrower, never under {@link SHORT_LABEL_CHARS} characters nor under the label's
 * widest word (when that fits the brand's label width), so a narrow gutter wraps a label between
 * words but never cuts a word that fits a label.
 *
 * @param spec - The diagram.
 * @param metrics - The node and gutter sizes, with the label width.
 * @param tokens - The brand's values.
 * @param width - The diagram's width, for a grid; `undefined` for an automatic layout.
 * @param cols - The grid's columns.
 */
function labelWidthsOf(
  spec: FlowSpec,
  metrics: FlowMetrics & { labelMaxWidth: number },
  tokens: DiagramTokens,
  width: number | undefined,
  cols: number,
): Map<string, number> {
  const padding = 2 * tokens.space.xs;
  const base = metrics.labelMaxWidth - padding;
  const least = tokens.measureEdgeLabel(LABEL_SAMPLE.slice(0, SHORT_LABEL_CHARS));
  const gutter =
    width === undefined || cols <= 1
      ? undefined
      : columnSizes(Math.max(width - 2 * groupDepth(spec) * metrics.groupPadding, 1), cols, metrics)
          .gutter;
  return new Map(
    spec.edges.flatMap((edge) => {
      if (edge.label === undefined) {
        return [];
      }

      const room =
        gutter === undefined || !runsAcross(edge, spec)
          ? base
          : Math.min(base, gutter - padding - 2 * LABEL_GUTTER_CLEARANCE);
      const word = Math.min(base, widestWord(edge.label, tokens.measureEdgeLabel));
      return [[edge.id, Math.max(room, least, word)] as const];
    }),
  );
}

/**
 * The text a diagram had to break inside a word or cut, named for `deck lint`: node titles and
 * subtitles with a word wider than the node's text box, and edge labels broken inside a word or cut
 * short.
 *
 * @param spec - The diagram.
 * @param cards - Each node's card, by id.
 * @param layout - Where its nodes went.
 * @param tokens - The brand's values, with the text measures.
 * @param labelWidths - The widest each label's lines get.
 */
function longTextOf(
  spec: FlowSpec,
  cards: ReadonlyMap<string, ResolvedCard>,
  layout: FlowLayout,
  tokens: DiagramTokens,
  labelWidths: ReadonlyMap<string, number>,
): string[] {
  const nodes = spec.nodes.flatMap((node) => {
    const rect = layout.nodes.get(node.id);
    if (rect === undefined) {
      return [];
    }

    const card = cardOf(cards, node).tokens;
    const { inset } = nodeGeometry(NODE_KINDS[node.kind].shape, card, rect);
    const chrome =
      rect.width < NARROW_NODE_WIDTH
        ? 2 * tokens.space.xs
        : 3 * tokens.space.sm + 2 * tokens.type.caption;
    const room = rect.width - chrome - inset.left - inset.right;
    return [
      ['title', node.title, card.measureTitle] as const,
      ['subtitle', node.subtitle ?? '', tokens.measureCaption] as const,
    ].flatMap(([part, text, measure]) =>
      widestWord(text, measure) > room ? [`the node ${part} "${text}"`] : [],
    );
  });
  const labels = spec.edges.flatMap((edge) => {
    const width = labelWidths.get(edge.id);
    if (edge.label === undefined || width === undefined) {
      return [];
    }

    const box = labelBox(edge.label, tokens.measureEdgeLabel, width);
    return box.broken || box.truncated ? [`the edge label "${edge.label}"`] : [];
  });
  return [...nodes, ...labels];
}

/**
 * How wide a node must be, stacked (narrow) and side by side (wide), for the widest whole word of
 * each node's title and subtitle to fit: the word, the body's padding, the icon beside the text
 * when wide, and the room the node's shape takes at its sides. A word that would not fit even the
 * widest node does not widen the others: it breaks anyway.
 *
 * @param tokens - The brand's values, with the text measurers.
 * @param spec - The diagram.
 * @param cards - Each node's card, by id, for its title font and shape; today's node without one.
 */
export function wordWidthsOf(
  tokens: DiagramTokens,
  spec: FlowSpec,
  cards: ReadonlyMap<string, ResolvedCard> = nodeCards(spec, tokens, undefined),
): { narrow: number; wide: number } {
  let narrow = 0;
  let wide = 0;
  for (const node of spec.nodes) {
    const card = cardOf(cards, node).tokens;
    const word = Math.max(
      widestWord(node.title, card.measureTitle),
      widestWord(node.subtitle ?? '', tokens.measureCaption),
    );
    const sample = { x: 0, y: 0, width: NARROW_NODE_WIDTH, height: tokens.type.caption * 4 };
    const { inset } = nodeGeometry(NODE_KINDS[node.kind].shape, card, sample);
    const sides = inset.left + inset.right + WORD_SLACK;
    const needNarrow = word + 2 * tokens.space.xs + sides;
    const needWide = word + 3 * tokens.space.sm + 2 * tokens.type.caption + sides;
    const least = needNarrow < NARROW_NODE_WIDTH ? needNarrow : needWide;
    if (least > tokens.type.caption * NODE_MAX_CAPTIONS) {
      continue;
    }

    narrow = Math.max(narrow, needNarrow);
    wide = Math.max(wide, needWide);
  }

  return { narrow, wide };
}

/**
 * Whether an edge's label sits in a gutter between columns: its nodes sit in one row, or the
 * diagram is laid out automatically and nothing is known yet.
 *
 * @param edge - The edge.
 * @param spec - The diagram.
 */
function runsAcross(edge: FlowSpec['edges'][number], spec: FlowSpec): boolean {
  const from = spec.nodes.find((node) => node.id === edge.from)?.cell;
  const to = spec.nodes.find((node) => node.id === edge.to)?.cell;
  return from === undefined || to === undefined || from.row === to.row;
}

/**
 * The diagram a spec's JSON describes, once per distinct content, so layout work is not redone when
 * the slide re-renders with equal children; checked for errors.
 *
 * @param json - The spec as JSON.
 * @throws Error listing every error, with its fix.
 */
function validSpec(json: string): FlowSpec {
  const spec = JSON.parse(json) as FlowSpec;
  assertValid(spec);
  return spec;
}

/**
 * Throws the problems that make a diagram invalid, with their fixes.
 *
 * @param spec - The diagram.
 * @throws Error listing every error.
 */
function assertValid(spec: FlowSpec): void {
  const errors = validateFlow(spec).filter((problem) => problem.severity === 'error');
  if (errors.length > 0) {
    throw new Error(
      `This <Flow> has ${errors.length} problem${errors.length === 1 ? '' : 's'}:\n` +
        errors.map((problem) => `- ${problem.message} ${problem.fix}`).join('\n'),
    );
  }
}

/**
 * The parts of a flow visible at a step, for its export description.
 *
 * @param input - The rendered flow, its layout and its frame.
 */
function flowParts(input: {
  element: HTMLElement;
  kind: 'flow' | 'tree' | 'cycle';
  id: string;
  spec: FlowSpec;
  cards: ReadonlyMap<string, ResolvedCard>;
  layout: FlowLayout;
  frame: ReturnType<typeof flowFrame>;
  summary: string;
  packets: readonly PacketDot[];
  tags: readonly PacketTag[];
}): DescribeInput {
  const { spec, layout, frame } = input;
  return {
    element: input.element,
    kind: input.kind,
    id: input.id,
    step: frame.step,
    summary: input.summary,
    packets: { dots: input.packets, tags: input.tags },
    groups: spec.groups.flatMap((group) => {
      const box = layout.groups.get(group.id);
      return box === undefined || frame.groups.get(group.id) !== true
        ? []
        : [{ id: group.id, rect: box.rect, ...optional('parent', group.parent) }];
    }),
    edges: spec.edges.flatMap((edge) => {
      const routed = layout.edges.get(edge.id);
      const edgeFrame = frame.edges.get(edge.id);
      if (routed === undefined || edgeFrame?.visible !== true) {
        return [];
      }

      const tone = frame.dimmed.has(edge.id) ? 'muted' : edgeFrame.tone;
      return [
        {
          id: edge.id,
          from: edge.from,
          to: edge.to,
          route: edge.route,
          arrow: edge.arrow,
          points: routed.points,
          segments: routed.segments,
          tone,
        },
      ];
    }),
    nodes: spec.nodes.flatMap((node) => {
      const rect = layout.nodes.get(node.id);
      const nodeFrame = frame.nodes.get(node.id);
      if (rect === undefined || nodeFrame?.visible !== true) {
        return [];
      }

      const state = frame.dimmed.has(node.id) ? 'muted' : nodeFrame.state;
      return [
        {
          id: node.id,
          kind: node.kind,
          state,
          shape: cardShape(NODE_KINDS[node.kind].shape, cardOf(input.cards, node).tokens.shape),
          rect,
          ...optional('group', node.group),
        },
      ];
    }),
  };
}

/**
 * When a node lights up after its packet lands, in milliseconds: never in a still.
 *
 * @param scene - What moves, once laid out.
 * @param still - Whether the diagram shows a still.
 * @param id - The node.
 */
function arrivalOf(
  scene: ReturnType<typeof packetScene> | undefined,
  still: boolean,
  id: string,
): number {
  if (still) {
    return 0;
  }

  return scene?.arrivals.get(id) ?? 0;
}

/**
 * The width a one-column node gets, as the grid will give it ({@link columnSizes}); the widest for
 * an automatic layout.
 *
 * @param size - The diagram's box, once measured.
 * @param metrics - The node and gutter sizes, once read.
 * @param cols - The grid's columns; `undefined` for an automatic layout.
 * @param spec - The diagram, for the room its groups take.
 * @returns The width; 0 before the box and the tokens are known.
 */
function singleNodeWidth(
  size: { width: number } | undefined,
  metrics: FlowMetrics | undefined,
  cols: number | undefined,
  spec: FlowSpec,
): number {
  if (size === undefined || metrics === undefined) {
    return 0;
  }

  if (cols === undefined) {
    return metrics.nodeMaxWidth;
  }

  const inset = 2 * groupDepth(spec) * metrics.groupPadding;
  return columnSizes(Math.max(size.width - inset, 1), cols, metrics).nodeWidth;
}

/**
 * The automatic layout to draw: the first candidate that fits the box at the layout's own spacing
 * (a `down` layout with more ranks than rows fit falls back to `right`), else the first.
 *
 * @param candidates - The layouts, best first.
 * @param size - The diagram's box.
 * @param metrics - The node and gutter sizes.
 * @param algorithm - The algorithm, for whether its centres snap to a grid.
 */
function fittingCandidate(
  candidates: readonly AutoCandidate[],
  size: { width: number; height: number },
  metrics: FlowMetrics,
  algorithm: AutoLayout,
): AutoCandidate | undefined {
  const node = { width: metrics.nodeMaxWidth, height: metrics.nodeHeight };
  /**
   * Whether a layout fits the box at its own spacing.
   */
  const fits = (candidate: AutoCandidate): boolean => {
    const cells =
      algorithm === 'layered' || algorithm === 'tree'
        ? cellsFromCentres(candidate.centres, node)
        : undefined;
    if (cells === undefined) {
      return !placeAtCentres(candidate.centres, size, metrics).cramped;
    }

    const { cols, rows } = gridSize([...cells.values()]);
    const tall = rows * metrics.nodeHeight + (rows - 1) * metrics.gutterY * ROW_GUTTER_SHARE;
    return !columnSizes(size.width, cols, metrics).cramped && tall <= size.height;
  };
  return candidates.find(fits) ?? candidates[0];
}

/**
 * Node extras with each kind's icon added where a node written in TSX has none of its own.
 *
 * @param spec - The diagram.
 * @param extras - Icons and content by node id, as written.
 * @param icons - The kinds' icons, once loaded.
 */
function withKindIcons(
  spec: FlowSpec,
  extras: ParsedFlow['extras'],
  icons: ReadonlyMap<string, NodeExtras['icon']>,
): ParsedFlow['extras'] {
  if (icons.size === 0) {
    return extras;
  }

  const result = new Map(extras);
  for (const node of spec.nodes) {
    const extra = extras.get(node.id);
    const icon = icons.get(node.kind);
    if (icon !== undefined && extra?.icon === undefined && extra?.iconless !== true) {
      result.set(node.id, { ...extra, icon });
    }
  }

  return result;
}

/**
 * How each edge is named in messages: its label, else its two nodes' titles.
 *
 * @param spec - The diagram.
 */
function edgeNames(spec: FlowSpec): Map<string, string> {
  const titles = new Map(spec.nodes.map((node) => [node.id, node.title]));
  return new Map(
    spec.edges.map((edge) => [
      edge.id,
      edge.label === undefined
        ? `the edge ${titles.get(edge.from) ?? edge.from} → ${titles.get(edge.to) ?? edge.to}`
        : `the edge "${edge.label}"`,
    ]),
  );
}

/**
 * How many entries of a frame map are visible.
 *
 * @param entries - Node or edge frames.
 */
function visibleCount(entries: ReadonlyMap<string, { visible: boolean }>): number {
  return [...entries.values()].filter((entry) => entry.visible).length;
}

/**
 * Each node's card, by id: its own card, else the diagram's, else the brand's card for its kind,
 * else `default` ({@link resolveCard}).
 *
 * @param spec - The diagram.
 * @param tokens - The brand's values, with its cards.
 * @param card - The diagram's card.
 */
export function nodeCards(
  spec: FlowSpec,
  tokens: Pick<DiagramTokens, 'cards'>,
  card: string | undefined,
): Map<string, ResolvedCard> {
  return new Map(
    spec.nodes.map((node) => [
      node.id,
      resolveCard(tokens.cards, { own: node.card, diagram: card, kind: node.kind }),
    ]),
  );
}

/**
 * A node's card from the resolved cards, or today's node when it has none.
 *
 * @param cards - Each node's card, by id.
 * @param node - The node.
 */
function cardOf(cards: ReadonlyMap<string, ResolvedCard>, node: FlowNodeSpec): ResolvedCard {
  return cards.get(node.id) ?? resolveCard(FALLBACK.cards, { kind: node.kind });
}
