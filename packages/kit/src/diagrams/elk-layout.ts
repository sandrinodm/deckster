import type { ElkNode } from 'elkjs/lib/elk-api';

import ELK from 'elkjs/lib/elk.bundled.js';

import type { AutoLayout, FlowDirection, FlowSpec } from '#diagrams/flow-spec.ts';
import type { Point } from '#diagrams/geometry.ts';

/**
 * What an automatic layout needs besides the diagram.
 */
export type AutoLayoutInput = {
  /**
   * The diagram.
   */
  spec: FlowSpec;

  /**
   * Every node's size, which ELK keeps clear.
   */
  size: { width: number; height: number };

  /**
   * The algorithm.
   */
  algorithm: AutoLayout;

  /**
   * Which way it flows.
   */
  direction: FlowDirection;

  /**
   * Room between nodes, in pixels.
   */
  spacing: number;
};

/**
 * ELK's algorithm id for each layout name.
 */
const ALGORITHMS: Readonly<Record<AutoLayout, string>> = {
  /**
   * Layers in the flow's direction, for pipelines and architectures.
   */
  layered: 'layered',

  /**
   * A tidy tree, for hierarchies.
   */
  tree: 'mrtree',

  /**
   * A force-directed spread, for networks with no direction.
   */
  force: 'force',

  /**
   * Rings around the first node, for hubs.
   */
  radial: 'radial',
};

/**
 * ELK's direction for each direction name.
 */
const DIRECTIONS: Readonly<Record<FlowDirection, string>> = {
  /**
   * Left to right.
   */
  right: 'RIGHT',

  /**
   * Top to bottom.
   */
  down: 'DOWN',

  /**
   * Right to left.
   */
  left: 'LEFT',

  /**
   * Bottom to top.
   */
  up: 'UP',
};

/**
 * How much more room layers get than nodes within a layer.
 */
const LAYER_SPACING_RATIO = 1.6;

/**
 * One ELK instance for the page, created on first use.
 */
let elk: InstanceType<typeof ELK> | undefined;

/**
 * The automatic layouts worth trying for a diagram, as `positions` keeps them: the direction asked
 * for, then the perpendicular one, which the diagram falls back to when the first does not fit its
 * box (a `down` layout with more ranks than rows fit runs `right` instead). Force and radial
 * layouts have no direction, so they have one.
 *
 * @param input - The diagram, the node size, the algorithm and the direction.
 * @returns Each direction's centres by node id, in ELK's coordinates, rounded to whole pixels.
 */
export async function autoLayoutPositions(input: AutoLayoutInput): Promise<AutoPositions> {
  const directions =
    input.algorithm === 'layered' || input.algorithm === 'tree'
      ? [input.direction, PERPENDICULAR[input.direction]]
      : [input.direction];
  const result: AutoPositions = {};
  for (const direction of directions) {
    const centres = await autoLayoutCentres({ ...input, direction });
    result[direction] = Object.fromEntries(
      [...centres].map(([id, point]) => [id, [Math.round(point.x), Math.round(point.y)]]),
    );
  }

  return result;
}

/**
 * Automatic layouts by direction: each node's centre as `[x, y]`, by id.
 */
export type AutoPositions = Partial<Record<FlowDirection, Record<string, [number, number]>>>;

/**
 * The direction across each direction, for the fallback layout.
 */
const PERPENDICULAR: Readonly<Record<FlowDirection, FlowDirection>> = {
  /**
   * A row that is too wide becomes a column.
   */
  right: 'down',

  /**
   * A column that is too tall becomes a row.
   */
  down: 'right',

  /**
   * As `right`.
   */
  left: 'down',

  /**
   * As `down`.
   */
  up: 'right',
};

/**
 * Lays out a diagram's nodes with ELK and returns each node's centre. Groups become ELK compound
 * nodes, so their members stay together, with room on top for their label. Declaration order breaks
 * cycles ({@link backEdges}) and orders nodes within a layer. Only the centres are used: the kit's
 * own router draws the edges, so automatic and grid diagrams look the same. This module, and ELK
 * with it, loads only on slides that have a `<Flow>` without grid cells.
 *
 * @param input - The diagram, the node size, the algorithm and the direction.
 * @returns Centres by node id, in ELK's coordinates.
 */
export async function autoLayoutCentres(input: AutoLayoutInput): Promise<Map<string, Point>> {
  elk ??= new ELK();
  const graph = elkGraph(input);
  const result = await elk.layout(graph);
  const centres = new Map<string, Point>();
  collectCentres(result, { x: 0, y: 0 }, input.spec, centres);
  return centres;
}

/**
 * The ELK graph for a diagram: nodes nested in their groups, every edge at the root.
 *
 * @param input - The layout input.
 */
function elkGraph(input: AutoLayoutInput): ElkNode {
  const back = backEdges(input.spec);
  return {
    id: 'root',
    layoutOptions: rootLayoutOptions(input),
    children: elkChildren(input, undefined),
    edges: input.spec.edges.map((edge) =>
      back.has(edge.id)
        ? { id: edge.id, sources: [edge.to], targets: [edge.from] }
        : { id: edge.id, sources: [edge.from], targets: [edge.to] },
    ),
  };
}

/**
 * The layout options of the ELK root: the algorithm, the direction and the spacing the diagram's
 * nodes and layers keep, with edges routed at right angles.
 *
 * @param input - The layout input.
 */
function rootLayoutOptions(input: AutoLayoutInput): Record<string, string> {
  const { spacing } = input;
  return {
    'elk.algorithm': ALGORITHMS[input.algorithm],
    'elk.direction': DIRECTIONS[input.direction],
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    'elk.spacing.nodeNode': String(spacing),
    'elk.layered.spacing.nodeNodeBetweenLayers': String(spacing * LAYER_SPACING_RATIO),
    'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
    'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    'elk.layered.crossingMinimization.forceNodeModelOrder': 'false',
    'elk.randomSeed': '1',
    'elk.mrtree.spacing.nodeNode': String(spacing),
    'elk.edgeRouting': 'ORTHOGONAL',
  };
}

/**
 * The ELK children of a group, or of the root: its inner groups and its nodes, in declaration
 * order, which ELK keeps.
 *
 * @param input - The layout input.
 * @param group - The group's id, or `undefined` for the root.
 */
function elkChildren(input: AutoLayoutInput, group: string | undefined): ElkNode[] {
  const { spec, size, spacing } = input;
  const groups = spec.groups
    .filter((candidate) => candidate.parent === group)
    .map((candidate) => ({
      order: firstNodeIndex(spec, candidate.id),
      node: {
        id: candidate.id,
        layoutOptions: {
          'elk.padding': `[top=${spacing},left=${spacing / 2},bottom=${spacing / 2},right=${spacing / 2}]`,
        },
        children: elkChildren(input, candidate.id),
      },
    }));
  const nodes = spec.nodes.flatMap((node, index) =>
    node.group === group
      ? [{ order: index, node: { id: node.id, width: size.width, height: size.height } }]
      : [],
  );
  return [...groups, ...nodes].sort((a, b) => a.order - b.order).map((entry) => entry.node);
}

/**
 * The edges that close a cycle when the diagram is walked in declaration order: a depth-first walk
 * from each node in the order the slide declares them, following edges in their order, where an
 * edge back to a node still on the walk's path is a back edge. ELK gets those edges reversed, so a
 * cycle is broken where the author's order says it loops back (the node declared first stays
 * first), and an acyclic diagram is left as it is.
 *
 * @param spec - The diagram.
 * @returns The back edges' ids.
 */
export function backEdges(spec: FlowSpec): Set<string> {
  const back = new Set<string>();
  const state = new Map<string, 'open' | 'done'>();
  const outgoing = new Map<string, FlowSpec['edges'][number][]>();
  for (const edge of spec.edges) {
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]);
  }

  /**
   * Walks from a node, marking the back edges it meets.
   */
  const visit = (id: string): void => {
    state.set(id, 'open');
    for (const edge of outgoing.get(id) ?? []) {
      const next = state.get(edge.to);
      if (next === 'open') {
        back.add(edge.id);
      } else if (next === undefined) {
        visit(edge.to);
      }
    }

    state.set(id, 'done');
  };
  for (const node of spec.nodes) {
    if (!state.has(node.id)) {
      visit(node.id);
    }
  }

  return back;
}

/**
 * Where a group comes in declaration order: the place of the first node in it, at any depth.
 *
 * @param spec - The diagram.
 * @param group - The group's id.
 */
function firstNodeIndex(spec: FlowSpec, group: string): number {
  /**
   * Whether a node's group is the group or sits in it.
   */
  const inside = (id: string | undefined): boolean => {
    let current = id;
    while (current !== undefined) {
      if (current === group) {
        return true;
      }

      current = spec.groups.find((candidate) => candidate.id === current)?.parent;
    }

    return false;
  };
  const index = spec.nodes.findIndex((node) => inside(node.group));
  return index === -1 ? spec.nodes.length : index;
}

/**
 * Collects the centre of every diagram node in an ELK result, adding up compound node offsets.
 *
 * @param node - An ELK node.
 * @param offset - Its parent's position.
 * @param spec - The diagram, to tell nodes from groups.
 * @param centres - The centres found so far, changed in place.
 */
function collectCentres(
  node: ElkNode,
  offset: Point,
  spec: FlowSpec,
  centres: Map<string, Point>,
): void {
  for (const child of node.children ?? []) {
    const x = offset.x + (child.x ?? 0);
    const y = offset.y + (child.y ?? 0);
    if (spec.nodes.some((candidate) => candidate.id === child.id)) {
      centres.set(child.id, { x: x + (child.width ?? 0) / 2, y: y + (child.height ?? 0) / 2 });
    }

    collectCentres(child, { x, y }, spec, centres);
  }
}
