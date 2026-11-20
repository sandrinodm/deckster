import type { DiagramAlign } from '#diagrams/diagram-design.ts';
import type { FlowSpec, GridCell } from '#diagrams/flow-spec.ts';
import type { PathSegment } from '#diagrams/path-geometry.ts';

import { alignedOffset } from '#diagrams/diagram-design.ts';
import {
  cellsFromCentres,
  groupDepth,
  groupRect,
  placeAtCentres,
  placeOnGrid,
  type FlowMetrics,
  type GridPlacement,
  type Insets,
} from '#diagrams/flow-grid.ts';
import { placeLabels, type LabelRequest, type PlacedLabel } from '#diagrams/flow-labels.ts';
import { collinearOverlaps, routeEdges, type RoutedEdge } from '#diagrams/flow-route.ts';
import { isInGroup } from '#diagrams/flow-validate.ts';
import { inflate, intersects, type Point, type Rect, type Side } from '#diagrams/geometry.ts';
import { NODE_KINDS, type NodeShape } from '#diagrams/node-kinds.ts';
import { flattenPath } from '#diagrams/path-geometry.ts';
import { maxOf, minOf } from '#foundation/lists.ts';

/**
 * How far two boxes must overlap each way, in pixels, to count as drawn on top of each other.
 */
const OVERLAP_TOLERANCE = 2;

/**
 * How far a node's box grows, in pixels, when edge labels keep off it, so a label does not touch
 * the node's border.
 */
const NODE_OBSTACLE_PAD_PX = 2;

/**
 * The prefix that marks a group's explicit area among the node boxes during placement.
 */
const GROUP_KEY_PREFIX = '\u0000group:';

/**
 * A measured size in canvas pixels.
 */
export type Size = {
  /**
   * The width.
   */
  width: number;

  /**
   * The height.
   */
  height: number;
};

/**
 * Router settings that come from the brand, in canvas pixels.
 */
export type RouteMetrics = {
  /**
   * Clearance around nodes and the length of port stubs.
   */
  margin: number;

  /**
   * The corner radius of orthogonal edges.
   */
  radius: number;

  /**
   * The most room between two ports on a side.
   */
  portSpacing: number;

  /**
   * Room left between an arrowhead's tip and the node it points at.
   */
  arrowGap: number;

  /**
   * Per-edge overrides of the arrow gap, in canvas pixels.
   */
  arrowGaps?: ReadonlyMap<string, number>;
};

/**
 * What the layout needs: the declaration, the box to fill, the measured sizes, and either grid
 * cells (in the spec) or the centres an automatic layout found.
 */
export type FlowLayoutInput = {
  /**
   * The diagram.
   */
  spec: FlowSpec;

  /**
   * The box to fill.
   */
  size: Size;

  /**
   * Node, gutter and group sizes.
   */
  metrics: FlowMetrics;

  /**
   * Router settings.
   */
  route: RouteMetrics;

  /**
   * Columns and rows to keep at least.
   */
  grid?: { cols?: number; rows?: number };

  /**
   * Each node's measured content height, so a grid row takes the height of its tallest node.
   */
  nodeHeights?: ReadonlyMap<string, number>;

  /**
   * Preferred widths of individual nodes.
   */
  nodeWidths?: ReadonlyMap<string, number>;

  /**
   * Node centres from an automatic layout, used when the nodes have no cells.
   */
  centres?: ReadonlyMap<string, Point>;

  /**
   * Snap the automatic layout's centres to grid cells (layered and tree layouts), or keep them as
   * they are (force and radial).
   */
  snap?: boolean;

  /**
   * Node sides where every edge meets one point, besides the shapes' own tips.
   */
  tips?: ReadonlyMap<string, ReadonlySet<Side>>;

  /**
   * The shape each node is drawn with, by id, when a card replaces its kind's shape; the kind's
   * shape for a node without one.
   */
  shapes?: ReadonlyMap<string, NodeShape>;

  /**
   * Each edge label's measured size, by edge id.
   */
  labels: ReadonlyMap<string, Size>;

  /**
   * Each group label's measured size, by group id.
   */
  groupLabels: ReadonlyMap<string, Size>;

  /**
   * Redraws the routed edges before labels are placed, for forms whose edges follow their own
   * shape: a cycle's arcs, a tree's buses.
   */
  reshape?: (layout: EdgeLayout) => ReadonlyMap<string, RoutedEdge>;
};

/**
 * What a form that redraws its edges gets: the placed nodes and the routed edges.
 */
export type EdgeLayout = {
  /**
   * Node boxes, by id.
   */
  nodes: ReadonlyMap<string, Rect>;

  /**
   * Routed edges, by id.
   */
  edges: ReadonlyMap<string, RoutedEdge>;

  /**
   * The diagram's box.
   */
  size: Size;
};

/**
 * A group's box and its label's box.
 */
export type GroupBox = {
  /**
   * The border.
   */
  rect: Rect;

  /**
   * The label in its top-left corner.
   */
  label: Rect;

  /**
   * How many groups it sits in, 0 for an outermost one.
   */
  depth: number;
};

/**
 * Where everything in a diagram goes, in diagram pixels.
 */
export type FlowLayout = {
  /**
   * The diagram's box.
   */
  size: Size;

  /**
   * Node boxes, by id.
   */
  nodes: ReadonlyMap<string, Rect>;

  /**
   * Group boxes, by id.
   */
  groups: ReadonlyMap<string, GroupBox>;

  /**
   * Routed edges, by id.
   */
  edges: ReadonlyMap<string, RoutedEdge>;

  /**
   * Placed edge labels, by edge id.
   */
  labels: ReadonlyMap<string, PlacedLabel>;

  /**
   * Whether the nodes are packed tighter than the gutters allow.
   */
  cramped: boolean;

  /**
   * Things drawn on top of each other: nodes on nodes, groups on groups they are not nested in,
   * group labels under nodes; each pair by the names a reader sees (titles and labels).
   */
  overlaps: readonly (readonly [string, string])[];

  /**
   * Edges that share no node but run along one line, by edge id.
   */
  edgeOverlaps: readonly (readonly [string, string])[];
};

/**
 * Lays a diagram out in its box: places the nodes (on the grid, or at an automatic layout's
 * centres), wraps groups around their members, routes every edge and places every edge label.
 *
 * @param input - The diagram, its box and its measured sizes.
 * @returns The layout; empty maps for a diagram with no nodes.
 */
export function layoutFlow(input: FlowLayoutInput): FlowLayout {
  const { spec, size, metrics } = input;
  const depth = groupDepth(spec);
  const side = depth * metrics.groupPadding;
  const insets = {
    top: depth * (metrics.groupPadding + metrics.groupLabel),
    right: side,
    bottom: side,
    left: side,
  };
  const placement = placeNodes(input, insets);
  const groups = placeGroups(spec, placement, metrics, input.groupLabels);
  const bounds = { x: 0, y: 0, width: size.width, height: size.height };
  const edges = routeAll(input, placement, bounds, groups);
  const placed = placeLabels(
    labelRequests(spec, input.labels, edges),
    labelObstacles(placement, groups),
    bounds,
    [...edges.values()].map((edge) => ({ id: edge.id, points: edge.points })),
  );
  const layout: FlowLayout = {
    size,
    nodes: placement.nodes,
    groups,
    edges,
    labels: new Map(placed.map((label) => [label.id, label])),
    cramped: placement.cramped,
    overlaps: overlapsOf(spec, placement.nodes, groups),
    edgeOverlaps: edgeOverlapsOf(spec, edges),
  };
  return metrics.align === undefined ? layout : alignScene(layout, metrics.align);
}

/**
 * Positions every part together after labels and paths have found room around the nodes.
 */
function alignScene(layout: FlowLayout, align: DiagramAlign): FlowLayout {
  const boxes = [
    ...layout.nodes.values(),
    ...[...layout.groups.values()].flatMap((group) => [group.rect, group.label]),
    ...[...layout.labels.values()].map((label) => label.rect),
  ];
  const paths = [...layout.edges.values()].flatMap((edge) => flattenPath(edge.segments));
  const positions = paths.map((point) => point.x);
  const left = minOf(
    boxes.map((box) => box.x),
    minOf(positions),
  );
  const right = maxOf(
    boxes.map((box) => box.x + box.width),
    maxOf(positions),
  );
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return layout;
  }

  const offset = alignedOffset(layout.size.width - (right - left), align) - left;
  /**
   * Shifts any point or box while retaining additional dimensions.
   */
  const move = <T extends Point>(point: T): T => ({ ...point, x: point.x + offset });
  return {
    ...layout,
    nodes: new Map([...layout.nodes].map(([id, box]) => [id, move(box)])),
    groups: new Map(
      [...layout.groups].map(([id, group]) => [
        id,
        {
          ...group,
          rect: move(group.rect),
          label: move(group.label),
        },
      ]),
    ),
    labels: new Map(
      [...layout.labels].map(([id, label]) => [id, { ...label, rect: move(label.rect) }]),
    ),
    edges: new Map(
      [...layout.edges].map(([id, edge]) => [
        id,
        {
          ...edge,
          points: edge.points.map(move),
          segments: edge.segments.map((segment) => moveSegment(segment, move)),
        },
      ]),
    ),
  };
}

/**
 * Translates a path segment and its control points.
 */
function moveSegment(segment: PathSegment, move: (point: Point) => Point): PathSegment {
  const endpoints = { from: move(segment.from), to: move(segment.to) };
  switch (segment.kind) {
    case 'line':
      return { ...segment, ...endpoints };
    case 'quad':
      return { ...segment, ...endpoints, control: move(segment.control) };
    case 'cubic':
      return { ...segment, ...endpoints, c1: move(segment.c1), c2: move(segment.c2) };
  }
}

/**
 * The pairs of things a layout drew on top of each other: two nodes, two groups neither of which
 * holds the other, a node and a group it is not in, and a group label and a node.
 *
 * @param spec - The diagram, for names and nesting.
 * @param nodes - The node boxes.
 * @param groups - The group boxes.
 */
export function overlapsOf(
  spec: FlowSpec,
  nodes: ReadonlyMap<string, Rect>,
  groups: ReadonlyMap<string, GroupBox>,
): [string, string][] {
  const title = new Map(spec.nodes.map((node) => [node.id, `"${node.title}"`]));
  const label = new Map(spec.groups.map((group) => [group.id, `group "${group.label}"`]));
  return [
    ...nodeOverlaps(spec, nodes, groups, title, label),
    ...groupOverlaps(spec, groups, label),
  ];
}

/**
 * Whether two boxes overlap by more than the tolerance both ways.
 *
 * @param a - A box.
 * @param b - Another.
 */
function overlapping(a: Rect, b: Rect): boolean {
  return (
    intersects(a, b) &&
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > OVERLAP_TOLERANCE &&
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > OVERLAP_TOLERANCE
  );
}

/**
 * The node pairs that overlap, and the nodes that overlap a group they are not in or a group label.
 *
 * @param spec - The diagram, for group membership.
 * @param nodes - The node boxes.
 * @param groups - The group boxes.
 * @param title - Each node's quoted title, by id.
 * @param label - Each group's name, by id.
 */
function nodeOverlaps(
  spec: FlowSpec,
  nodes: ReadonlyMap<string, Rect>,
  groups: ReadonlyMap<string, GroupBox>,
  title: ReadonlyMap<string, string>,
  label: ReadonlyMap<string, string>,
): [string, string][] {
  const pairs: [string, string][] = [];
  const nodeList = [...nodes];
  nodeList.forEach(([a, rectA], index) => {
    for (const [b, rectB] of nodeList.slice(index + 1)) {
      if (overlapping(rectA, rectB)) {
        pairs.push([title.get(a) ?? a, title.get(b) ?? b]);
      }
    }

    for (const [group, box] of groups) {
      const member = isInGroup(spec, spec.nodes.find((node) => node.id === a)?.group, group);
      if (!member && overlapping(rectA, box.rect)) {
        pairs.push([title.get(a) ?? a, label.get(group) ?? group]);
      }

      if (box.label.width > 0 && overlapping(rectA, box.label)) {
        pairs.push([title.get(a) ?? a, `the label of ${label.get(group) ?? group}`]);
      }
    }
  });
  return pairs;
}

/**
 * The group pairs whose boxes overlap though neither group holds the other.
 *
 * @param spec - The diagram, for nesting.
 * @param groups - The group boxes.
 * @param label - Each group's name, by id.
 */
function groupOverlaps(
  spec: FlowSpec,
  groups: ReadonlyMap<string, GroupBox>,
  label: ReadonlyMap<string, string>,
): [string, string][] {
  const pairs: [string, string][] = [];
  const groupList = [...groups];
  groupList.forEach(([a, boxA], index) => {
    for (const [b, boxB] of groupList.slice(index + 1)) {
      if (!isInGroup(spec, a, b) && !isInGroup(spec, b, a) && overlapping(boxA.rect, boxB.rect)) {
        pairs.push([label.get(a) ?? a, label.get(b) ?? b]);
      }
    }
  });
  return pairs;
}

/**
 * Places the nodes on the grid, or at the automatic layout's centres.
 *
 * @param input - The layout input.
 * @param insets - Room kept at the edges for group borders.
 */
function placeNodes(input: FlowLayoutInput, insets: Insets): GridPlacement {
  const { spec, size } = input;
  const metrics =
    input.metrics.align === undefined
      ? input.metrics
      : { ...input.metrics, align: 'center' as const };
  const dimensions = {
    ...(input.nodeHeights === undefined ? {} : { heights: input.nodeHeights }),
    ...(input.nodeWidths === undefined ? {} : { widths: input.nodeWidths }),
  };
  const cells = new Map<string, GridCell>();
  for (const node of spec.nodes) {
    if (node.cell !== undefined) {
      cells.set(node.id, node.cell);
    }
  }

  if (cells.size === spec.nodes.length && cells.size > 0) {
    for (const group of spec.groups) {
      if (group.cell !== undefined) {
        cells.set(groupKey(group.id), group.cell);
      }
    }

    return placeOnGrid(cells, size, metrics, {
      ...input.grid,
      insets,
      ...dimensions,
    });
  }

  if (input.centres !== undefined && input.centres.size > 0) {
    const node = { width: metrics.nodeMaxWidth, height: metrics.nodeHeight };
    const snapped = input.snap === true ? cellsFromCentres(input.centres, node) : undefined;
    if (snapped === undefined) {
      return placeAtCentres(input.centres, size, metrics, insets, input.nodeWidths);
    }

    return placeOnGrid(snapped, size, metrics, { insets, ...dimensions });
  }

  return { nodes: new Map(), bounds: { x: 0, y: 0, width: 0, height: 0 }, cramped: false };
}

/**
 * Wraps each group around its members, innermost first, so an outer group wraps the inner one's
 * border too; a group with an explicit area takes that area.
 *
 * @param spec - The diagram.
 * @param placement - The node boxes (and explicit group areas).
 * @param metrics - Padding and label sizes.
 * @param labels - Each group label's measured size.
 */
function placeGroups(
  spec: FlowSpec,
  placement: GridPlacement,
  metrics: FlowMetrics,
  labels: ReadonlyMap<string, Size>,
): Map<string, GroupBox> {
  /**
   * How many groups a group sits in.
   */
  const depthOf = (id: string): number => {
    let depth = 0;
    let parent = spec.groups.find((group) => group.id === id)?.parent;
    while (parent !== undefined) {
      depth += 1;
      const current: string = parent;
      parent = spec.groups.find((group) => group.id === current)?.parent;
    }

    return depth;
  };
  const ordered = [...spec.groups].sort((a, b) => depthOf(b.id) - depthOf(a.id));
  const boxes = new Map<string, GroupBox>();
  for (const group of ordered) {
    const explicit = placement.nodes.get(groupKey(group.id));
    const members = [
      ...spec.nodes
        .filter((node) => node.group === group.id)
        .map((node) => placement.nodes.get(node.id)),
      ...spec.groups
        .filter((inner) => inner.parent === group.id)
        .map((inner) => boxes.get(inner.id)?.rect),
    ].filter((rect) => rect !== undefined);
    const area = explicit === undefined ? members : [explicit];
    if (area.length === 0) {
      continue;
    }

    const rect = groupRect(area, metrics);
    const labelSize = labels.get(group.id) ?? { width: 0, height: 0 };
    boxes.set(group.id, {
      rect,
      label: {
        x: rect.x + metrics.groupPadding,
        y: rect.y + (metrics.groupLabel + metrics.groupPadding - labelSize.height) / 2,
        width: labelSize.width,
        height: labelSize.height,
      },
      depth: depthOf(group.id),
    });
  }

  for (const key of placement.nodes.keys()) {
    if (key.startsWith(GROUP_KEY_PREFIX)) {
      placement.nodes.delete(key);
    }
  }

  return boxes;
}

/**
 * Routes every edge around the placed nodes and group labels, then lets a form that redraws its
 * edges replace them.
 *
 * @param input - The layout input.
 * @param placement - The placed nodes.
 * @param bounds - The diagram's box.
 * @param groups - The placed groups, whose labels the edges keep off.
 */
function routeAll(
  input: FlowLayoutInput,
  placement: GridPlacement,
  bounds: Rect,
  groups: ReadonlyMap<string, GroupBox>,
): ReadonlyMap<string, RoutedEdge> {
  const { spec, size, route } = input;
  const routed = routeEdges(
    spec.edges.map((edge) => {
      const gap = route.arrowGaps?.get(edge.id) ?? route.arrowGap;
      return {
        id: edge.id,
        from: edge.from,
        to: edge.to,
        route: edge.route,
        ...(edge.fromSide === undefined ? {} : { fromSide: edge.fromSide }),
        ...(edge.toSide === undefined ? {} : { toSide: edge.toSide }),
        startGap: edge.arrow === 'start' || edge.arrow === 'both' ? gap : 0,
        endGap: edge.arrow === 'end' || edge.arrow === 'both' ? gap : 0,
      };
    }),
    placement.nodes,
    {
      margin: route.margin,
      radius: route.radius,
      portSpacing: route.portSpacing,
      bounds,
      tips: new Map([...tipsOf(spec, input.shapes), ...(input.tips ?? [])]),
      ...(placement.cells === undefined ? {} : { cells: placement.cells }),
      obstacles: [...groups.values()].map((group) => group.label),
    },
  );
  const routedEdges = new Map(routed.map((edge) => [edge.id, edge]));
  if (input.reshape === undefined) {
    return routedEdges;
  }

  return input.reshape({ nodes: placement.nodes, edges: routedEdges, size });
}

/**
 * The edges that have a size and a route, each with the points and segments its label keeps off.
 *
 * @param spec - The diagram.
 * @param labels - Each edge label's measured size, by edge id.
 * @param edges - The routed edges, by id.
 */
function labelRequests(
  spec: FlowSpec,
  labels: ReadonlyMap<string, Size>,
  edges: ReadonlyMap<string, RoutedEdge>,
): LabelRequest[] {
  return spec.edges.flatMap((edge) => {
    const labelSize = labels.get(edge.id);
    const path = edges.get(edge.id);
    if (labelSize === undefined || path === undefined) {
      return [];
    }

    return [{ id: edge.id, ...labelSize, points: path.points, segments: path.segments }];
  });
}

/**
 * The boxes an edge label keeps off: the nodes, padded, and the group labels.
 *
 * @param placement - The placed nodes.
 * @param groups - The placed groups.
 */
function labelObstacles(placement: GridPlacement, groups: ReadonlyMap<string, GroupBox>): Rect[] {
  return [
    ...[...placement.nodes.values()].map((rect) => inflate(rect, NODE_OBSTACLE_PAD_PX)),
    ...[...groups.values()].map((group) => group.label),
  ];
}

/**
 * The pairs of edges that share no node but run along one line. Edges that join a node to itself
 * are left out.
 *
 * @param spec - The diagram, for each edge's ends.
 * @param edges - The routed edges, by id.
 */
function edgeOverlapsOf(
  spec: FlowSpec,
  edges: ReadonlyMap<string, RoutedEdge>,
): FlowLayout['edgeOverlaps'] {
  return collinearOverlaps(
    [...edges.values()].filter((edge) => {
      const declared = spec.edges.find((candidate) => candidate.id === edge.id);
      return declared !== undefined && declared.from !== declared.to;
    }),
    new Map(spec.edges.map((edge) => [edge.id, { from: edge.from, to: edge.to }])),
  );
}

/**
 * The sides of each node that come to a point, where edges meet the tip: a hexagon's left and right
 * ends and every corner of a diamond.
 *
 * @param spec - The diagram.
 * @param shapes - The shape each node is drawn with, when its card replaces its kind's.
 */
export function tipsOf(
  spec: FlowSpec,
  shapes?: ReadonlyMap<string, NodeShape>,
): Map<string, ReadonlySet<Side>> {
  const tips = new Map<string, ReadonlySet<Side>>();
  for (const node of spec.nodes) {
    const shape = shapes?.get(node.id) ?? NODE_KINDS[node.kind].shape;
    if (shape === 'hexagon') {
      tips.set(node.id, new Set<Side>(['left', 'right']));
    }

    if (shape === 'diamond') {
      tips.set(node.id, new Set<Side>(['top', 'right', 'bottom', 'left']));
    }
  }

  return tips;
}

/**
 * The key a group's explicit area is placed under.
 *
 * @param id - The group id.
 */
function groupKey(id: string): string {
  return `${GROUP_KEY_PREFIX}${id}`;
}
