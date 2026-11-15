import type { Point, Rect } from '#diagrams/geometry.ts';

/**
 * A corner of a node a badge can sit on. A wide node carries it on the border at that corner; a
 * narrow node (its icon is centred on the edge) carries it just outside the corner, above for a top
 * corner and below for a bottom one.
 */
export type BadgeCorner = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

/**
 * The corners a badge is tried at, in order: the top right is where badges have always been, and
 * the others are only used when an edge would run under it.
 */
export const BADGE_CORNERS: readonly BadgeCorner[] = [
  'top-right',
  'top-left',
  'bottom-right',
  'bottom-left',
];

/**
 * The narrowest node, in pixels, whose badge sits on its border; narrower nodes centre their icon
 * there, so the badge sits outside the node instead.
 */
export const BADGE_ON_EDGE_MIN_WIDTH = 300;

/**
 * How far an edge may come to a badge, in pixels, before it counts as running under it: an
 * arrowhead is about this wide.
 */
export const BADGE_EDGE_CLEARANCE_PX = 8;

/**
 * The line height of the label step as a multiple of its size, taken high so a badge's estimated
 * height is never short.
 */
const BADGE_LINE_HEIGHT = 1.5;

/**
 * The size of a badge's status dot as a share of the label size.
 */
const BADGE_DOT_SHARE = 0.45;

/**
 * What the placement needs to know about the brand, in canvas pixels.
 */
export type BadgeMetrics = {
  /**
   * The size of the label step the badge is set in.
   */
  labelSize: number;

  /**
   * The width of a string set in the label step, in its case and letter spacing.
   */
  measureLabel: (text: string) => number;

  /**
   * The small and extra small spacing steps.
   */
  space: { xs: number; sm: number };

  /**
   * The width of the badge's border.
   */
  stroke: number;
};

/**
 * A badge placed on a node: the corner it sits at and the box it takes there.
 */
export type PlacedBadge = {
  /**
   * The corner chosen.
   */
  corner: BadgeCorner;

  /**
   * The box the badge covers, estimated from its text.
   */
  box: Rect;

  /**
   * The ids of the edges that still run through the badge or its clearance at that corner, none
   * when the corner is free.
   */
  covered: readonly string[];
};

/**
 * One edge as the placement sees it: its id and the corners of its path, the last of which is the
 * arrowhead end.
 */
export type BadgeEdge = {
  /**
   * The edge id.
   */
  id: string;

  /**
   * The corners of the path.
   */
  points: readonly Point[];
};

/**
 * The estimated size of a badge with this text: the dot, the text in the label step and the
 * padding.
 *
 * @param text - The badge's text.
 * @param metrics - The brand's sizes.
 */
export function badgeSize(text: string, metrics: BadgeMetrics): { width: number; height: number } {
  const textWidth = metrics.measureLabel(text);
  const dot = BADGE_DOT_SHARE * metrics.labelSize;
  return {
    width: textWidth + dot + 3 * metrics.space.xs + 2 * metrics.stroke,
    height: metrics.labelSize * BADGE_LINE_HEIGHT + 2 * metrics.stroke,
  };
}

/**
 * The box a badge covers at a corner. It mirrors the stylesheet: on the border of a wide node the
 * badge's edge stands a small step in from the corner and it is centred a little above the border
 * line; outside a narrow node it stands an extra small step off the corner.
 *
 * @param corner - The corner.
 * @param node - The node's box.
 * @param size - The badge's size.
 * @param space - The small and extra small spacing steps.
 */
export function badgeBox(
  corner: BadgeCorner,
  node: Rect,
  size: { width: number; height: number },
  space: { xs: number; sm: number },
): Rect {
  const lifted = node.width < BADGE_ON_EDGE_MIN_WIDTH;
  const right = corner.endsWith('right');
  const top = corner.startsWith('top');
  const inset = lifted ? space.xs : space.sm;
  const x = right ? node.x + node.width - inset - size.width : node.x + inset;
  const border = top ? node.y : node.y + node.height;
  let y: number;
  if (lifted) {
    y = top ? border - space.xs - size.height : border + space.xs;
  } else {
    y = top ? border - 0.55 * size.height : border - 0.45 * size.height;
  }

  return { x, y, width: size.width, height: size.height };
}

/**
 * Whether a straight segment passes through a box, by clipping it to the box (Liang and Barsky).
 *
 * @param from - One end of the segment.
 * @param to - The other.
 * @param box - The box.
 */
export function segmentHitsBox(from: Point, to: Point, box: Rect): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const edges: readonly (readonly [number, number])[] = [
    [-dx, from.x - box.x],
    [dx, box.x + box.width - from.x],
    [-dy, from.y - box.y],
    [dy, box.y + box.height - from.y],
  ];
  let enter = 0;
  let leave = 1;
  for (const [direction, distance] of edges) {
    if (direction === 0) {
      if (distance < 0) {
        return false;
      }

      continue;
    }

    const at = distance / direction;
    if (direction < 0) {
      enter = Math.max(enter, at);
    } else {
      leave = Math.min(leave, at);
    }

    if (enter > leave) {
      return false;
    }
  }

  return true;
}

/**
 * The ids of the edges whose path runs through a box grown by the clearance, so an edge or its
 * arrowhead that passes within the clearance counts.
 *
 * @param box - The badge's box.
 * @param edges - The edges drawn.
 */
export function edgesThrough(box: Rect, edges: readonly BadgeEdge[]): string[] {
  const grown = {
    x: box.x - BADGE_EDGE_CLEARANCE_PX,
    y: box.y - BADGE_EDGE_CLEARANCE_PX,
    width: box.width + 2 * BADGE_EDGE_CLEARANCE_PX,
    height: box.height + 2 * BADGE_EDGE_CLEARANCE_PX,
  };
  return edges.flatMap((edge) =>
    edge.points.some((point, index) => {
      const next = edge.points[index + 1];
      return next !== undefined && segmentHitsBox(point, next, grown);
    })
      ? [edge.id]
      : [],
  );
}

/**
 * Chooses the corner a badge sits at: the first corner in {@link BADGE_CORNERS} that no edge runs
 * through; when every corner has an edge under it, the corner with the fewest (the top right on a
 * tie), reported in `covered`.
 *
 * @param node - The node's box.
 * @param text - The badge's text.
 * @param edges - The edges drawn at this step.
 * @param metrics - The brand's sizes.
 */
export function placeBadge(
  node: Rect,
  text: string,
  edges: readonly BadgeEdge[],
  metrics: BadgeMetrics,
): PlacedBadge {
  const size = badgeSize(text, metrics);
  const options = BADGE_CORNERS.map((corner): PlacedBadge => {
    const box = badgeBox(corner, node, size, metrics.space);
    return { corner, box, covered: edgesThrough(box, edges) };
  });
  const free = options.find((option) => option.covered.length === 0);
  if (free !== undefined) {
    return free;
  }

  return options.reduce((best, option) =>
    option.covered.length < best.covered.length ? option : best,
  );
}
