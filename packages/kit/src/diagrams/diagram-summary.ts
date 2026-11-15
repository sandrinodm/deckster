import type { FlowFrame } from '#diagrams/choreography.ts';
import type { FlowSpec } from '#diagrams/flow-spec.ts';
import type { Rect } from '#diagrams/geometry.ts';

/**
 * The most nodes a summary lists one by one before it shortens the rest to a count.
 */
const MAX_LISTED = 24;

/**
 * Writes the text alternative of a diagram at a step: how many nodes and connections it shows, the
 * nodes in reading order (top to bottom, left to right) with their kind, group and state, the
 * connections with their labels, and what is moving. Screen readers read it in place of the
 * drawing, and exports keep it as alt text.
 *
 * @param spec - The diagram.
 * @param frame - What the step shows.
 * @param boxes - Node boxes, for the reading order; source order without them.
 * @returns Plain sentences.
 */
export function flowSummary(
  spec: FlowSpec,
  frame: FlowFrame,
  boxes?: ReadonlyMap<string, Rect>,
): string {
  const nodes = spec.nodes.filter((node) => frame.nodes.get(node.id)?.visible === true);
  const ordered =
    boxes === undefined
      ? nodes
      : [...nodes].sort((a, b) => readingOrder(boxes.get(a.id), boxes.get(b.id)));
  const edges = spec.edges.filter((edge) => frame.edges.get(edge.id)?.visible === true);
  const titles = new Map(spec.nodes.map((node) => [node.id, node.title]));
  const listed = ordered.slice(0, MAX_LISTED).map((node) => {
    const state = frame.nodes.get(node.id)?.state ?? 'default';
    const group = spec.groups.find((candidate) => candidate.id === node.group)?.label;
    const details = [
      node.kind === 'node' ? undefined : node.kind,
      group === undefined ? undefined : `in ${group}`,
      isQuietState(state) ? undefined : state,
    ].filter((detail) => detail !== undefined);
    return details.length === 0 ? node.title : `${node.title} (${details.join(', ')})`;
  });
  const more = ordered.length > MAX_LISTED ? `, and ${ordered.length - MAX_LISTED} more` : '';
  const connections = edges.map((edge) => {
    const from = titles.get(edge.from) ?? edge.from;
    const to = titles.get(edge.to) ?? edge.to;
    const join = edge.arrow === 'both' ? 'and' : 'to';
    const label = edge.label === undefined ? '' : ` (${edge.label})`;
    return `${from} ${join} ${to}${label}`;
  });
  const moving = frame.trips.map(({ trip }) => {
    const path = trip.path.map((id) => titles.get(id) ?? id).join(' to ');
    const label = trip.label === undefined ? '' : ` carrying ${trip.label}`;
    return `${path}${label}${trip.reply === undefined ? '' : ', and back'}`;
  });
  return [
    `${count(ordered.length, 'node')} and ${count(edges.length, 'connection')}.`,
    ordered.length === 0 ? '' : `Nodes: ${listed.join('; ')}${more}.`,
    connections.length === 0 ? '' : `Connections: ${connections.join('; ')}.`,
    moving.length === 0 ? '' : `Moving now: ${moving.join('; ')}.`,
  ]
    .filter((sentence) => sentence !== '')
    .join(' ');
}

/**
 * Orders two boxes for reading: by row, then left to right. Boxes whose tops are within half a box
 * of each other count as one row.
 *
 * @param a - A box.
 * @param b - Another box.
 */
export function readingOrder(a: Rect | undefined, b: Rect | undefined): number {
  if (a === undefined || b === undefined) {
    return 0;
  }

  const sameRow = Math.abs(a.y - b.y) < Math.min(a.height, b.height) / 2;
  return sameRow ? a.x - b.x : a.y - b.y;
}

/**
 * A count with its noun, singular or plural.
 *
 * @param n - The count.
 * @param noun - The singular noun.
 */
export function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/**
 * What a flow's step changes, in a sentence for a live region: what moves, and the nodes whose
 * state the step sets, with their badges.
 *
 * @param spec - The diagram.
 * @param frame - The step.
 */
export function flowLiveNote(spec: FlowSpec, frame: FlowFrame): string {
  const titles = new Map(spec.nodes.map((node) => [node.id, node.title]));
  const moving = frame.trips.map(({ trip }) => {
    const path = trip.path.map((id) => titles.get(id) ?? id).join(' to ');
    return trip.label === undefined ? path : `${path} carrying ${trip.label}`;
  });
  const states = spec.nodes.flatMap((node) => {
    const shown = frame.nodes.get(node.id);
    if (shown === undefined || !shown.visible || isQuietState(shown.state)) {
      return [];
    }

    const badge = shown.badge === undefined ? '' : ` (${shown.badge})`;
    return [`${node.title} ${shown.state}${badge}`];
  });
  return [
    moving.length === 0 ? '' : `Moving: ${moving.join('; ')}.`,
    states.length === 0 ? '' : `${states.join('; ')}.`,
  ]
    .filter((sentence) => sentence !== '')
    .join(' ');
}

/**
 * Whether a node state is the resting one, which the summary leaves unsaid.
 *
 * @param state - The node's state at the step.
 */
function isQuietState(state: string): boolean {
  return state === 'default' || state === 'muted';
}
