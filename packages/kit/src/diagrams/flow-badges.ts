import type { EdgeFrame, NodeFrame } from '#diagrams/choreography.ts';
import type { DiagramTokens } from '#diagrams/diagram-tokens.ts';
import type { FlowLayout } from '#diagrams/flow-layout.ts';

import { placeBadge, type BadgeEdge, type PlacedBadge } from '#diagrams/badge-placement.ts';

/**
 * Places every badge a step shows, each clear of the edges drawn at that step where a corner of its
 * node is free (see {@link placeBadge}).
 *
 * @param layout - Where the nodes and edges went.
 * @param nodes - What each node shows at this step.
 * @param edges - What each edge shows at this step.
 * @param tokens - The brand's values, for the badge's size.
 * @returns The placement of each visible badge, by node id.
 */
export function placeBadges(
  layout: FlowLayout,
  nodes: ReadonlyMap<string, NodeFrame>,
  edges: ReadonlyMap<string, EdgeFrame>,
  tokens: DiagramTokens,
): Map<string, PlacedBadge> {
  const drawn: BadgeEdge[] = [...layout.edges.values()].flatMap((edge) =>
    edges.get(edge.id)?.visible === true ? [{ id: edge.id, points: edge.points }] : [],
  );
  const placed = new Map<string, PlacedBadge>();
  for (const [id, frame] of nodes) {
    const rect = layout.nodes.get(id);
    if (rect === undefined || frame.badge === undefined || !frame.visible) {
      continue;
    }

    placed.set(
      id,
      placeBadge(rect, frame.badge, drawn, {
        labelSize: tokens.type.label,
        measureLabel: tokens.measureLabel,
        space: tokens.space,
        stroke: tokens.stroke.regular,
      }),
    );
  }

  return placed;
}
