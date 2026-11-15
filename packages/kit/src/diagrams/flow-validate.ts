import { DIAGRAM_HARD_LIMITS } from '#diagrams/diagram-limits.ts';
import { edgeBetween, type FlowSpec, type GridCell } from '#diagrams/flow-spec.ts';
import { maxOf, minOf, pushAll } from '#foundation/lists.ts';

/**
 * The most close matches an unknown id gets.
 */
const MAX_SUGGESTIONS = 3;

/**
 * How much an id that contains another adds to its similarity, on the same scale as the number of
 * leading characters the two share.
 */
const CONTAINMENT_BONUS = 2;

/**
 * Something wrong with a diagram's declaration, with the change that fixes it.
 */
export type DiagramProblem = {
  /**
   * Errors fail the build; warnings are printed.
   */
  severity: 'error' | 'warning';

  /**
   * What is wrong, as a sentence that names the element.
   */
  message: string;

  /**
   * What to change, as a sentence.
   */
  fix: string;
};

/**
 * Checks a diagram's declaration: ids that do not exist, packets between nodes no edge joins,
 * overlapping grid cells, nodes outside their group or inside a group they are not in, and a grid
 * that places some nodes but not others. The build runs it on every `<Flow>` in MDX, and the
 * component runs it again in development for TSX slides.
 *
 * @param spec - The diagram as data.
 * @returns Every problem, errors first; an empty list for a sound diagram.
 */
export function validateFlow(spec: FlowSpec): DiagramProblem[] {
  const problems = [
    ...checkEmpty(spec),
    ...checkSize(spec),
    ...checkIds(spec),
    ...checkEdges(spec),
    ...checkTrips(spec),
    ...checkStates(spec),
    ...checkCells(spec),
    ...checkGroups(spec),
  ];
  return [
    ...problems.filter((problem) => problem.severity === 'error'),
    ...problems.filter((problem) => problem.severity === 'warning'),
  ];
}

/**
 * The cell area a group covers: its explicit cell, else the cells of its nodes and inner groups.
 *
 * @param spec - The diagram.
 * @param groupId - The group.
 * @returns The area; `undefined` for a group with no placed member.
 */
export function groupCellArea(spec: FlowSpec, groupId: string): GridCell | undefined {
  const group = spec.groups.find((candidate) => candidate.id === groupId);
  if (group?.cell !== undefined) {
    return group.cell;
  }

  const areas = [
    ...spec.nodes.filter((node) => node.group === groupId).map((node) => node.cell),
    ...spec.groups
      .filter((inner) => inner.parent === groupId)
      .map((inner) => groupCellArea(spec, inner.id)),
  ].filter((cell) => cell !== undefined);
  if (areas.length === 0) {
    return undefined;
  }

  const col = minOf(areas.map((cell) => cell.col));
  const row = minOf(areas.map((cell) => cell.row));
  const right = maxOf(areas.map((cell) => cell.col + cell.colSpan));
  const bottom = maxOf(areas.map((cell) => cell.row + cell.rowSpan));
  return { col, row, colSpan: right - col, rowSpan: bottom - row };
}

/**
 * Whether a node is a member of a group, directly or through inner groups.
 *
 * @param spec - The diagram.
 * @param nodeGroup - The node's innermost group.
 * @param groupId - The group asked about.
 */
export function isInGroup(spec: FlowSpec, nodeGroup: string | undefined, groupId: string): boolean {
  let current = nodeGroup;
  while (current !== undefined) {
    if (current === groupId) {
      return true;
    }

    current = spec.groups.find((group) => group.id === current)?.parent;
  }

  return false;
}

/**
 * A diagram with no nodes, which draws nothing.
 *
 * @param spec - The diagram.
 */
function checkEmpty(spec: FlowSpec): DiagramProblem[] {
  if (spec.nodes.length > 0) {
    return [];
  }

  return [
    {
      severity: 'error',
      message: 'The diagram has no <Node>s, so it draws nothing.',
      fix: 'Add the nodes inside it (<Node id="api" title="API" />), or remove the empty diagram.',
    },
  ];
}

/**
 * A diagram with more nodes or edges than the router can lay out in a reasonable time.
 *
 * @param spec - The diagram.
 */
function checkSize(spec: FlowSpec): DiagramProblem[] {
  const { maxNodes, maxEdges } = DIAGRAM_HARD_LIMITS;
  const problems: DiagramProblem[] = [];
  if (spec.nodes.length > maxNodes) {
    problems.push({
      severity: 'error',
      message: `The diagram has ${spec.nodes.length} nodes; a diagram takes at most ${maxNodes} nodes.`,
      fix: 'Split it into several diagrams, one idea each: a slide carries about 12 nodes.',
    });
  }

  if (spec.edges.length > maxEdges) {
    problems.push({
      severity: 'error',
      message: `The diagram has ${spec.edges.length} edges; a diagram takes at most ${maxEdges} edges.`,
      fix: 'Split it into several diagrams, or drop the edges that carry no part of the point.',
    });
  }

  return problems;
}

/**
 * Duplicate node, group and edge ids.
 *
 * @param spec - The diagram.
 */
function checkIds(spec: FlowSpec): DiagramProblem[] {
  const seen = new Set<string>();
  const problems: DiagramProblem[] = [];
  for (const id of [...spec.nodes.map((node) => node.id), ...spec.groups.map((g) => g.id)]) {
    if (seen.has(id)) {
      problems.push({
        severity: 'error',
        message: `Two nodes or groups have the id "${id}".`,
        fix: 'Give every <Node> and <Group> its own `id`.',
      });
    }

    seen.add(id);
  }

  const edges = new Set<string>();
  for (const { id } of spec.edges) {
    if (edges.has(id)) {
      problems.push({
        severity: 'error',
        message: `Two edges have the <Edge id="${id}">, so they would draw as one route.`,
        fix: 'Give every <Edge> its own `id`, or leave `id` out so each gets one from its ends.',
      });
    }

    edges.add(id);
  }

  return problems;
}

/**
 * Edges that name nodes that do not exist. An edge from a node to itself is a self loop (a retry),
 * drawn as a small loop on the node.
 *
 * @param spec - The diagram.
 */
function checkEdges(spec: FlowSpec): DiagramProblem[] {
  const problems: DiagramProblem[] = [];
  for (const edge of spec.edges) {
    for (const end of ['from', 'to'] as const) {
      pushAll(problems, unknownNode(spec, edge[end], `<Edge ${end}="${edge[end]}">`));
    }
  }

  return problems;
}

/**
 * Packets and journey hops that name unknown nodes or run between nodes no edge joins.
 *
 * @param spec - The diagram.
 */
function checkTrips(spec: FlowSpec): DiagramProblem[] {
  const problems: DiagramProblem[] = [];
  for (const trip of spec.trips) {
    const where = `The packet "${trip.path.join(' → ')}"`;
    if (trip.path.length < 2) {
      problems.push({
        severity: 'error',
        message: `${where} names fewer than two nodes.`,
        fix: 'Give it `from` and `to`, or a `path` of two or more node ids.',
      });
      continue;
    }

    const unknown = trip.path.flatMap((id) => unknownNode(spec, id, where));
    pushAll(problems, unknown);
    if (unknown.length > 0) {
      continue;
    }

    for (let index = 1; index < trip.path.length; index += 1) {
      const from = trip.path[index - 1] as string;
      const to = trip.path[index] as string;
      if (edgeBetween(spec.edges, from, to) === undefined) {
        problems.push({
          severity: 'error',
          message: `${where} travels from "${from}" to "${to}", but no edge joins them.`,
          fix:
            `Add <Edge from="${from}" to="${to}" />, ` +
            'or route the packet through nodes that are joined.',
        });
      }
    }

    if (trip.until !== undefined && trip.at !== undefined && trip.until <= trip.at) {
      problems.push({
        severity: 'error',
        message: `${where} stops at step ${trip.until}, before it starts at step ${trip.at}.`,
        fix: 'Set `until` to a step after `at`, or leave it out to play only on step `at`.',
      });
    }
  }

  return problems;
}

/**
 * State changes and focus ranges that name unknown nodes or edges.
 *
 * @param spec - The diagram.
 */
function checkStates(spec: FlowSpec): DiagramProblem[] {
  const problems: DiagramProblem[] = [];
  for (const change of spec.states) {
    if (change.node !== undefined) {
      pushAll(problems, unknownNode(spec, change.node, `<State node="${change.node}">`));
    }

    if (change.edge !== undefined && !spec.edges.some((edge) => edge.id === change.edge)) {
      const edgeIds = spec.edges.map((edge) => edge.id);
      problems.push({
        severity: 'error',
        message: `<State edge="${change.edge}"> names an edge that does not exist.`,
        fix:
          `Use an edge id: ${closeTo(change.edge, edgeIds)}. ` +
          'Edges are named `from->to` unless they have an `id`.',
      });
    }

    if (change.node === undefined && change.edge === undefined) {
      problems.push({
        severity: 'error',
        message: `A <State at={${change.at}}> names neither a node nor an edge.`,
        fix: 'Add `node="id"` or `edge="from->to"`.',
      });
    }
  }

  for (const focus of spec.focus) {
    for (const id of focus.nodes) {
      pushAll(problems, unknownNode(spec, id, `<Focus at={${focus.at}}>`));
    }
  }

  return problems;
}

/**
 * Grid problems: a grid that places only some nodes, and nodes that share a cell.
 *
 * @param spec - The diagram.
 */
function checkCells(spec: FlowSpec): DiagramProblem[] {
  const placed = spec.nodes.filter((node) => node.cell !== undefined);
  if (placed.length === 0) {
    return [];
  }

  const problems: DiagramProblem[] = [];
  const unplaced = spec.nodes.filter((node) => node.cell === undefined);
  if (unplaced.length > 0) {
    const unplacedIds = unplaced.map((node) => `"${node.id}"`).join(', ');
    problems.push({
      severity: 'error',
      message: `Some nodes have a grid cell and some do not: ${unplacedIds} ` + 'have none.',
      fix: 'Give every node `col` and `row`, or remove them all for an automatic layout.',
    });
  }

  for (let a = 0; a < placed.length; a += 1) {
    for (let b = a + 1; b < placed.length; b += 1) {
      const first = placed[a];
      const second = placed[b];
      if (first?.cell === undefined || second?.cell === undefined) {
        continue;
      }

      if (cellsOverlap(first.cell, second.cell)) {
        problems.push({
          severity: 'error',
          message:
            `Nodes "${first.id}" and "${second.id}" share a grid cell ` +
            `(col ${second.cell.col}, row ${second.cell.row}).`,
          fix: `Move "${second.id}" to a free cell, or shorten the span of "${first.id}".`,
        });
      }
    }
  }

  return problems;
}

/**
 * Group problems on a grid: a member outside its group's explicit area, a node inside a group's
 * area that is not a member, and two groups that overlap without one holding the other.
 *
 * @param spec - The diagram.
 */
function checkGroups(spec: FlowSpec): DiagramProblem[] {
  const problems: DiagramProblem[] = [];
  for (const group of spec.groups) {
    if (group.parent !== undefined && !spec.groups.some((other) => other.id === group.parent)) {
      pushAll(problems, unknownNode(spec, group.parent, `<Group id="${group.id}">`));
    }

    const area = groupCellArea(spec, group.id);
    if (area === undefined) {
      continue;
    }

    for (const node of spec.nodes) {
      if (node.cell === undefined) {
        continue;
      }

      const member = isInGroup(spec, node.group, group.id);
      if (member && !cellInside(area, node.cell)) {
        problems.push({
          severity: 'error',
          message: `Node "${node.id}" is in group "${group.label}" but sits outside its area.`,
          fix:
            `Move "${node.id}" inside columns ${columnRange(area)} and rows ${rowRange(area)}, ` +
            'or widen the group.',
        });
      }

      if (!member && cellsOverlap(area, node.cell)) {
        problems.push({
          severity: 'error',
          message: `Node "${node.id}" sits inside group "${group.label}" but is not in it.`,
          fix:
            `Nest "${node.id}" inside the <Group>, or move it out of columns ${columnRange(area)}, ` +
            `rows ${rowRange(area)}.`,
        });
      }
    }
  }

  pushAll(problems, checkGroupOverlaps(spec));
  return problems;
}

/**
 * Two groups whose areas overlap though neither holds the other.
 *
 * @param spec - The diagram.
 */
function checkGroupOverlaps(spec: FlowSpec): DiagramProblem[] {
  const problems: DiagramProblem[] = [];
  for (let a = 0; a < spec.groups.length; a += 1) {
    for (let b = a + 1; b < spec.groups.length; b += 1) {
      const first = spec.groups[a];
      const second = spec.groups[b];
      if (first === undefined || second === undefined) {
        continue;
      }

      const nested = isInGroup(spec, first.id, second.id) || isInGroup(spec, second.id, first.id);
      if (nested) {
        continue;
      }

      const areaA = groupCellArea(spec, first.id);
      const areaB = groupCellArea(spec, second.id);
      if (areaA === undefined || areaB === undefined || !cellsOverlap(areaA, areaB)) {
        continue;
      }

      problems.push({
        severity: 'error',
        message: `Groups "${first.label}" and "${second.label}" overlap.`,
        fix:
          'Move their nodes apart so the groups do not share a cell, ' +
          'or nest one group in the other.',
      });
    }
  }

  return problems;
}

/**
 * A problem for an id that names no node, with close matches.
 *
 * @param spec - The diagram.
 * @param id - The id as written.
 * @param where - The element that wrote it, for the message.
 */
function unknownNode(spec: FlowSpec, id: string, where: string): DiagramProblem[] {
  const ids = [...spec.nodes.map((node) => node.id), ...spec.groups.map((group) => group.id)];
  if (ids.includes(id)) {
    return [];
  }

  return [
    {
      severity: 'error',
      message: `${where} names "${id}", which is not a node in this diagram.`,
      fix: `Use one of the node ids: ${closeTo(id, ids)}.`,
    },
  ];
}

/**
 * The ids most like a misspelt one first, then the rest, as a short list.
 *
 * @param id - The id as written.
 * @param ids - The ids that exist.
 */
function closeTo(id: string, ids: readonly string[]): string {
  const ranked = [...ids].sort((a, b) => similarity(b, id) - similarity(a, id));
  const shown = ranked.slice(0, Math.max(MAX_SUGGESTIONS, 0)).map((candidate) => `"${candidate}"`);
  const rest = ids.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} (and ${rest} more)` : shown.join(', ') || 'none yet';
}

/**
 * A rough likeness of two ids: shared leading characters, and containment.
 *
 * @param a - An id.
 * @param b - Another id.
 */
function similarity(a: string, b: string): number {
  let prefix = 0;
  while (prefix < Math.min(a.length, b.length) && a[prefix] === b[prefix]) {
    prefix += 1;
  }

  const contains = a.includes(b) || b.includes(a) ? CONTAINMENT_BONUS : 0;
  return prefix + contains;
}

/**
 * The columns an area covers, written as an inclusive range for a message.
 *
 * @param area - The area.
 */
function columnRange(area: GridCell): string {
  return `${area.col}–${area.col + area.colSpan - 1}`;
}

/**
 * The rows an area covers, written as an inclusive range for a message.
 *
 * @param area - The area.
 */
function rowRange(area: GridCell): string {
  return `${area.row}–${area.row + area.rowSpan - 1}`;
}

/**
 * Whether two cell areas share a cell.
 *
 * @param a - An area.
 * @param b - Another area.
 */
function cellsOverlap(a: GridCell, b: GridCell): boolean {
  return (
    a.col < b.col + b.colSpan &&
    b.col < a.col + a.colSpan &&
    a.row < b.row + b.rowSpan &&
    b.row < a.row + a.rowSpan
  );
}

/**
 * Whether a cell area lies inside another.
 *
 * @param outer - The containing area.
 * @param inner - The area that should be inside.
 */
function cellInside(outer: GridCell, inner: GridCell): boolean {
  return (
    inner.col >= outer.col &&
    inner.row >= outer.row &&
    inner.col + inner.colSpan <= outer.col + outer.colSpan &&
    inner.row + inner.rowSpan <= outer.row + outer.rowSpan
  );
}
