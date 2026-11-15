import { Children, isValidElement, useMemo, type ReactNode } from 'react';

import type { DiagramTokens } from '#diagrams/diagram-tokens.ts';
import type { EdgeLayout } from '#diagrams/flow-layout.ts';
import type { IconComponent, NodeProps } from '#diagrams/flow-parts.tsx';
import type { RoutedEdge } from '#diagrams/flow-route.ts';
import type { FlowSpec } from '#diagrams/flow-spec.ts';
import type { Point, Rect, Side } from '#diagrams/geometry.ts';

import { assertDiagramProps, formatProblems } from '#diagrams/diagram-props.ts';
import { type NodeExtras, type ParsedFlow } from '#diagrams/flow-children.ts';
import { PART_NAMES } from '#diagrams/flow-parts.tsx';
import { buildFlowSpec, optional, type FlowPart } from '#diagrams/flow-spec-builder.ts';
import { FlowView } from '#diagrams/flow.tsx';
import { duplicates } from '#diagrams/form-validate.ts';
import { roundedPath } from '#diagrams/path-geometry.ts';
import { treeCells, type TreeShape } from '#diagrams/tree-layout.ts';
import { minOf } from '#foundation/lists.ts';

/**
 * Room before an arrowhead's tip, in regular strokes.
 */
const ARROW_GAP_STROKES = 1.5;

/**
 * The sides an edge of a tree leaves its parent from and enters its child on.
 */
type GrowthSides = {
  /**
   * The side of the parent the edge leaves from.
   */
  from: Side;

  /**
   * The side of the child the edge enters.
   */
  to: Side;
};

/**
 * The sides a tree's edges use, by the way the tree grows: down leaves a parent's bottom and enters
 * the child's top, right leaves its right side and enters the child's left.
 */
const GROWTH_SIDES: Readonly<Record<'down' | 'right', GrowthSides>> = {
  /**
   * A tree that grows down.
   */
  down: { from: 'bottom', to: 'top' },

  /**
   * A tree that grows right.
   */
  right: { from: 'right', to: 'left' },
};

/**
 * Props of {@link Tree}.
 */
export type TreeProps = {
  /**
   * An id for the export description.
   */
  id?: string;

  /**
   * What the tree shows, in a few words: its accessible name.
   */
  title: string;

  /**
   * Which way it grows: `down` (the default) or `right`.
   */
  direction?: 'down' | 'right';

  /**
   * A fixed height in canvas pixels; without it the tree fills its region.
   */
  height?: number;

  /**
   * One root `<Node>`, with its children nested inside it.
   */
  children?: ReactNode;
};

/**
 * A hierarchy: nest `<Node>`s inside each other and the tree lays itself out, each parent centred
 * over its children, with edges that branch from one point under the parent. Nodes take every
 * `<Node>` prop (`kind`, `title`, `subtitle`, `state`, `at` to reveal a branch by step).
 *
 * ```mdx
 * <Tree title="How a delivery price is decided">
 *   <Node id="price" kind="decision" title="Price">
 *     <Node id="zone" title="Zone" />
 *     <Node id="weight" title="Weight" at={1} />
 *   </Node>
 * </Tree>
 * ```
 */
export function Tree({ id, title, direction = 'down', height, children }: TreeProps): ReactNode {
  const parsed = useMemo(() => parseTree(children, direction), [children, direction]);
  const tips = useMemo(() => parentTips(parsed.parents, direction), [parsed, direction]);
  const reshape = useMemo(
    () => (layout: EdgeLayout, tokens: DiagramTokens) =>
      busEdges(layout, parsed.spec, direction, {
        radius: tokens.radius.lg,
        gap: tokens.stroke.regular * ARROW_GAP_STROKES,
      }),
    [parsed, direction],
  );
  return (
    <FlowView
      parsed={parsed}
      kind="tree"
      title={title}
      algorithm="layered"
      direction={direction}
      tips={tips}
      reshape={reshape}
      {...optional('id', id)}
      {...optional('height', height)}
    />
  );
}

/**
 * A parsed tree: the flow it draws as, and which nodes have children.
 */
type ParsedTree = ParsedFlow & {
  /**
   * Ids of nodes with children.
   */
  parents: readonly string[];
};

/**
 * Reads nested `<Node>`s into a flow: each node placed on the grid by the tree layout, an edge from
 * each parent to each child, revealed with the child.
 *
 * @param children - The tree's children: one root node.
 * @param direction - Which way it grows.
 * @throws Error when something other than a `<Node>` sits in the tree.
 */
function parseTree(children: ReactNode, direction: 'down' | 'right'): ParsedTree {
  const extras = new Map<string, NodeExtras>();
  const roots = readNodes(children, extras);
  const repeated = duplicates(allIds(roots), '<Node>');
  if (repeated.length > 0) {
    throw new Error(formatProblems('This <Tree>', repeated));
  }

  const cells = treeCells(roots);
  const parts: FlowPart[] = [];
  const parents: string[] = [];
  /**
   * Adds a node, the edge from its parent and its subtree.
   */
  const visit = (node: TreeShape & { props: NodeProps }, parent: string | undefined): void => {
    const place = gridPlace(cells.get(node.id), direction);
    const props: Record<string, unknown> = { ...node.props, ...place };
    delete props['children'];
    delete props['icon'];
    parts.push({ part: 'Node', props, children: [] });
    if (parent !== undefined) {
      parts.push(edgePart(parent, node, direction));
    }

    if (node.children.length > 0) {
      parents.push(node.id);
    }

    for (const child of node.children) {
      visit(child as TreeShape & { props: NodeProps }, node.id);
    }
  };
  for (const root of roots) {
    visit(root, undefined);
  }

  return { spec: buildFlowSpec(parts), extras, parents };
}

/**
 * The edge from a parent to one of its children, which is revealed with the child.
 *
 * @param parent - The parent's id.
 * @param child - The child node.
 * @param direction - Which way the tree grows.
 */
function edgePart(parent: string, child: TreeElement, direction: 'down' | 'right'): FlowPart {
  const sides = GROWTH_SIDES[direction];
  return {
    part: 'Edge',
    props: {
      from: parent,
      to: child.id,
      fromSide: sides.from,
      toSide: sides.to,
      ...optional('at', child.props.at),
    },
    children: [],
  };
}

/**
 * A tree cell as grid props: depth down the rows for a tree that grows down, across the columns for
 * one that grows right.
 *
 * @param cell - The node's tree cell.
 * @param direction - Which way the tree grows.
 */
function gridPlace(
  cell: { depth: number; across: number } | undefined,
  direction: 'down' | 'right',
): { col?: number; row?: number } {
  if (cell === undefined) {
    return {};
  }

  return direction === 'down'
    ? { col: cell.across, row: cell.depth }
    : { col: cell.depth, row: cell.across };
}

/**
 * A tree node read from its element.
 */
type TreeElement = TreeShape & {
  /**
   * The node's props.
   */
  props: NodeProps;
};

/**
 * Reads `<Node>` elements and the nodes nested in them.
 *
 * @param children - Elements.
 * @param extras - Node icons, filled in place.
 */
function readNodes(children: ReactNode, extras: Map<string, NodeExtras>): TreeElement[] {
  return Children.toArray(children).flatMap((child): TreeElement[] => {
    if (!isValidElement(child)) {
      return [];
    }

    if (PART_NAMES.get(child.type) !== 'Node') {
      throw new Error(
        'A <Tree> holds only <Node>s, nested inside each other: ' +
          'put each node inside its parent <Node>.',
      );
    }

    assertDiagramProps('Node', child.props as Record<string, unknown>);
    const props = child.props as NodeProps;
    const icon: IconComponent | undefined =
      typeof props.icon === 'function' ? props.icon : undefined;
    extras.set(props.id, {
      ...optional('icon', icon),
      ...(props.icon === 'none' ? { iconless: true } : {}),
    });
    return [{ id: props.id, props, children: readNodes(props.children, extras) }];
  });
}

/**
 * The side of every parent its edges leave from, as one shared point.
 *
 * @param parents - Ids of nodes with children.
 * @param direction - Which way the tree grows.
 */
function parentTips(
  parents: readonly string[],
  direction: 'down' | 'right',
): Map<string, ReadonlySet<Side>> {
  const side = GROWTH_SIDES[direction].from;
  return new Map(parents.map((id) => [id, new Set<Side>([side])]));
}

/**
 * Every id in a forest of tree nodes, depth first.
 *
 * @param nodes - The roots.
 */
function allIds(nodes: readonly TreeShape[]): string[] {
  return nodes.flatMap((node) => [node.id, ...allIds(node.children)]);
}

/**
 * Redraws a tree's edges as buses: from the middle of each parent's growing side, one trunk to a
 * bus line halfway to its children (one line per parent, so sibling branches leave it at one
 * height), along it to above each child, and into the middle of the child's facing side.
 *
 * @param layout - The placed nodes and routed edges.
 * @param spec - The tree as a flow, for its edges.
 * @param direction - Which way it grows.
 * @param style - The corner radius and the gap left before an arrowhead's tip.
 */
export function busEdges(
  layout: EdgeLayout,
  spec: FlowSpec,
  direction: 'down' | 'right',
  style: { radius: number; gap: number },
): Map<string, RoutedEdge> {
  const down = direction === 'down';
  const sides = GROWTH_SIDES[direction];
  const edges = new Map(layout.edges);
  const children = new Map<string, Rect[]>();
  for (const edge of spec.edges) {
    const child = layout.nodes.get(edge.to);
    if (child !== undefined) {
      children.set(edge.from, [...(children.get(edge.from) ?? []), child]);
    }
  }

  for (const edge of spec.edges) {
    const parent = layout.nodes.get(edge.from);
    const child = layout.nodes.get(edge.to);
    const siblings = children.get(edge.from) ?? [];
    if (parent === undefined || child === undefined) {
      continue;
    }

    const points = busPoints(parent, child, siblings, down, style.gap);
    edges.set(edge.id, {
      id: edge.id,
      points,
      segments: roundedPath(points, style.radius),
      fromSide: sides.from,
      toSide: sides.to,
    });
  }

  return edges;
}

/**
 * The corners of one tree edge on its parent's bus.
 *
 * @param parent - The parent's box.
 * @param child - The child's box.
 * @param siblings - Every child of the parent, which sets the bus line.
 * @param down - Whether the tree grows down (else right).
 * @param gap - Room before the arrowhead's tip.
 */
function busPoints(
  parent: Rect,
  child: Rect,
  siblings: readonly Rect[],
  down: boolean,
  gap: number,
): Point[] {
  if (down) {
    const x = parent.x + parent.width / 2;
    const from = parent.y + parent.height;
    const nearest = minOf(siblings.map((rect) => rect.y));
    const bus = from + (nearest - from) / 2;
    const cx = child.x + child.width / 2;
    return [
      { x, y: from },
      { x, y: bus },
      { x: cx, y: bus },
      { x: cx, y: child.y - gap },
    ];
  }

  const y = parent.y + parent.height / 2;
  const from = parent.x + parent.width;
  const nearest = minOf(siblings.map((rect) => rect.x));
  const bus = from + (nearest - from) / 2;
  const cy = child.y + child.height / 2;
  return [
    { x: from, y },
    { x: bus, y },
    { x: bus, y: cy },
    { x: child.x - gap, y: cy },
  ];
}
