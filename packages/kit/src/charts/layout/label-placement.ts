/**
 * A rectangle in chart pixels.
 */
export type Box = {
  /**
   * The left edge.
   */
  x: number;

  /**
   * The top edge.
   */
  y: number;

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
 * One label to place along a line: where it wants to sit and how much room it takes.
 */
export type DodgeItem = {
  /**
   * The centre it wants, such as the y of a line's last point.
   */
  target: number;

  /**
   * Its extent along the line, such as its height plus the gap it keeps.
   */
  size: number;
};

/**
 * Where a label sits around its anchor point.
 */
export type Placement =
  | 'above'
  | 'below'
  | 'right'
  | 'left'
  | 'above-right'
  | 'above-left'
  | 'below-right'
  | 'below-left';

/**
 * A label to place around a point without covering other labels or marks.
 */
export type PointLabel = {
  /**
   * The point it labels.
   */
  anchor: { x: number; y: number };

  /**
   * The label's width.
   */
  width: number;

  /**
   * The label's height.
   */
  height: number;

  /**
   * The placements to try, best first; every placement when left out.
   */
  placements?: readonly Placement[];
};

/**
 * A placed label: its box and the placement it took.
 */
export type PlacedLabel = {
  /**
   * The label's box.
   */
  box: Box;

  /**
   * Where it sits around its anchor.
   */
  placement: Placement;

  /**
   * Whether it still overlaps something, because no placement was free.
   */
  overlaps: boolean;

  /**
   * How many gaps away from its anchor it sits: 1 beside it, more when it had to move out to find
   * room (a leader should then join them). 1 when left out.
   */
  reach?: number;
};

/**
 * Every placement, in the order labels prefer them.
 */
const ALL_PLACEMENTS: readonly Placement[] = [
  'above-right',
  'above',
  'above-left',
  'right',
  'left',
  'below-right',
  'below',
  'below-left',
];

/**
 * Most passes the dodge makes before it settles.
 */
const DODGE_PASSES = 64;

/**
 * The side of the boxes a leader is sampled in.
 */
const LEADER_SAMPLE = 4;

/**
 * How much a leader crossing text costs against a label covering it, per pixel of overlap.
 */
const LEADER_WEIGHT = 8;

/**
 * How much a label reaching outside the bounds costs, per pixel of its area outside.
 */
const OUTSIDE_WEIGHT = 4;

/**
 * A label of a dodge, with its position in the order it was given.
 */
type DodgeMember = DodgeItem & {
  /**
   * The label's position in the order it was given.
   */
  index: number;
};

/**
 * A run of dodge labels packed edge to edge.
 */
type DodgeCluster = {
  /**
   * Where the run starts.
   */
  start: number;

  /**
   * The labels in the run, in target order.
   */
  members: DodgeMember[];
};

/**
 * Spreads labels along one line (the right edge of a line chart, one side of a slope chart) so none
 * overlaps the next, each as close to its target as it can be, all inside `[min, max]`. It packs
 * labels that would collide into clusters centred on their targets' mean and merges clusters that
 * touch, as a force layout would settle, then clamps the whole run to the bounds.
 *
 * @param items - The labels, each with its target centre and size.
 * @param min - The start of the room (the top, for labels stacked down a chart).
 * @param max - The end of the room.
 * @returns The centre of each label, in the order given.
 */
export function dodge(items: readonly DodgeItem[], min: number, max: number): number[] {
  const order: DodgeMember[] = items
    .map((item, index) => ({ ...item, index }))
    .toSorted((a, b) => a.target - b.target);
  const clusters = settleClusters(
    order.map((item) => ({ start: item.target - item.size / 2, members: [item] })),
  );
  const centres: number[] = Array.from({ length: items.length }, () => 0);
  const total = clusters.reduce((sum, cluster) => sum + extent(cluster), 0);
  const room = max - min;
  let floor = min;
  let left = total;
  for (const cluster of clusters) {
    const size = extent(cluster);
    const ceiling = max - left;
    const start = total > room ? floor : Math.min(Math.max(cluster.start, floor), ceiling);
    let offset = start;
    for (const member of cluster.members) {
      centres[member.index] = offset + member.size / 2;
      offset += member.size;
    }

    floor = start + size;
    left -= size;
  }

  return centres;
}

/**
 * Merges clusters that touch, pass after pass, until none touches the next or the passes run out.
 *
 * @param initial - One cluster per label, in target order.
 */
function settleClusters(initial: DodgeCluster[]): DodgeCluster[] {
  let clusters = initial;
  for (let pass = 0; pass < DODGE_PASSES; pass += 1) {
    const { merged, changed } = mergeTouching(clusters);
    clusters = merged;
    if (!changed) {
      break;
    }
  }

  return clusters;
}

/**
 * One pass of merging: each cluster that overlaps the one before it joins that one, and the merged
 * run is centred on its members' targets again.
 *
 * @param clusters - The clusters, in order.
 */
function mergeTouching(clusters: readonly DodgeCluster[]): {
  merged: DodgeCluster[];
  changed: boolean;
} {
  const merged: DodgeCluster[] = [];
  let changed = false;
  for (const cluster of clusters) {
    const previous = merged.at(-1);
    if (previous !== undefined && previous.start + extent(previous) > cluster.start) {
      const members = [...previous.members, ...cluster.members];
      merged[merged.length - 1] = { start: centredStart(members), members };
      changed = true;
    } else {
      merged.push(cluster);
    }
  }

  return { merged, changed };
}

/**
 * Places labels around their points one by one, each at the first placement that stays inside the
 * bounds and covers neither an obstacle (a mark, the plot's own text) nor a label placed before it.
 * A label with no free placement takes the one that overlaps least and is marked.
 *
 * @param labels - The labels, most important first: earlier labels get the better places.
 * @param obstacles - Boxes no label may cover.
 * @param bounds - The box every label must stay inside.
 * @param gap - The space between a label and its anchor.
 * @param reaches - How many gaps out to try, in order, when no placement beside the anchor is free:
 *   `[1]` (only beside it) when left out; `[1, 3, 5]` lets a label move out and take a leader.
 */
export function placeLabels(
  labels: readonly PointLabel[],
  obstacles: readonly Box[],
  bounds: Box,
  gap: number,
  reaches: readonly number[] = [1],
): PlacedLabel[] {
  const taken = [...obstacles];
  return labels.map((label) => {
    const placed = bestPlacement(label, reaches, taken, bounds, gap) ?? {
      box: boxAt(label, 'above', gap),
      placement: 'above' as const,
      overlaps: true,
    };
    taken.push(placed.box);
    if ((placed.reach ?? 1) > 1) {
      pushAll(taken, leaderBoxes(label.anchor, placed.box, gap));
    }

    return placed;
  });
}

/**
 * The cheapest placement of one label: the first that costs nothing, else the cheapest over every
 * reach and placement tried. Undefined when the label has no placements to try.
 *
 * @param label - The label.
 * @param reaches - How many gaps out to try, in order.
 * @param taken - Every box already taken, which the label must not cover.
 * @param bounds - The box the label must stay inside.
 * @param gap - The space between a label and its anchor.
 */
function bestPlacement(
  label: PointLabel,
  reaches: readonly number[],
  taken: readonly Box[],
  bounds: Box,
  gap: number,
): PlacedLabel | undefined {
  let best: PlacedLabel | undefined;
  let bestCost = Number.POSITIVE_INFINITY;
  for (const reach of reaches) {
    for (const placement of label.placements ?? ALL_PLACEMENTS) {
      const box = boxAt(label, placement, gap * reach);
      // A label out of reach of its point takes a leader, which must not cross other text.
      const leader = reach > 1 ? leaderBoxes(label.anchor, box, gap) : [];
      const cost = placementCost(box, leader, bounds, taken);
      if (cost < bestCost) {
        best = { box, placement, overlaps: cost > 0, reach };
        bestCost = cost;
      }

      if (cost === 0) {
        break;
      }
    }

    if (bestCost === 0) {
      break;
    }
  }

  return best;
}

/**
 * What a placement costs: its area outside the bounds, the area it covers of taken boxes, and the
 * area its leader covers of them, weighted so a leader crossing text is dear.
 *
 * @param box - The label's box at the placement.
 * @param leader - The boxes along its leader, if it has one.
 * @param bounds - The box the label must stay inside.
 * @param taken - Every box already taken.
 */
function placementCost(
  box: Box,
  leader: readonly Box[],
  bounds: Box,
  taken: readonly Box[],
): number {
  const leaderOverlap = leader.reduce((sum, part) => sum + overlapWith(part, taken), 0);
  return (
    outside(box, bounds) * OUTSIDE_WEIGHT + overlapWith(box, taken) + leaderOverlap * LEADER_WEIGHT
  );
}

/**
 * The total area a box covers of the given boxes.
 *
 * @param box - The box.
 * @param boxes - The boxes it may cover.
 */
function overlapWith(box: Box, boxes: readonly Box[]): number {
  return boxes.reduce((sum, other) => sum + overlapArea(box, other), 0);
}

/**
 * Small boxes along the leader from a point to the nearest edge of its label, from a gap away from
 * the point, so a placement can be priced by what its leader would cross.
 *
 * @param anchor - The point.
 * @param box - The label's box.
 * @param gap - The room left around the point.
 */
export function leaderBoxes(anchor: { x: number; y: number }, box: Box, gap: number): Box[] {
  const end = {
    x: Math.min(Math.max(anchor.x, box.x), box.x + box.width),
    y: Math.min(Math.max(anchor.y, box.y), box.y + box.height),
  };
  const length = Math.hypot(end.x - anchor.x, end.y - anchor.y);
  const size = LEADER_SAMPLE;
  const boxes: Box[] = [];
  for (let along = gap; along < length; along += size) {
    const x = anchor.x + ((end.x - anchor.x) * along) / length;
    const y = anchor.y + ((end.y - anchor.y) * along) / length;
    boxes.push({ x: x - size / 2, y: y - size / 2, width: size, height: size });
  }

  return boxes;
}

/**
 * The area two boxes share; 0 when they do not overlap.
 *
 * @param a - One box.
 * @param b - The other.
 */
export function overlapArea(a: Box, b: Box): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

/**
 * Whether two boxes overlap.
 *
 * @param a - One box.
 * @param b - The other.
 */
export function boxesOverlap(a: Box, b: Box): boolean {
  return overlapArea(a, b) > 0;
}

/**
 * A label's box at one placement around its anchor.
 *
 * @param label - The label.
 * @param placement - Where it sits.
 * @param gap - The space between label and anchor.
 */
function boxAt(label: PointLabel, placement: Placement, gap: number): Box {
  const { anchor, width, height } = label;
  const horizontal: Record<Placement, number> = {
    above: anchor.x - width / 2,
    below: anchor.x - width / 2,
    right: anchor.x + gap,
    left: anchor.x - gap - width,
    'above-right': anchor.x + gap / 2,
    'above-left': anchor.x - gap / 2 - width,
    'below-right': anchor.x + gap / 2,
    'below-left': anchor.x - gap / 2 - width,
  };
  const vertical: Record<Placement, number> = {
    above: anchor.y - gap - height,
    below: anchor.y + gap,
    right: anchor.y - height / 2,
    left: anchor.y - height / 2,
    'above-right': anchor.y - gap / 2 - height,
    'above-left': anchor.y - gap / 2 - height,
    'below-right': anchor.y + gap / 2,
    'below-left': anchor.y + gap / 2,
  };
  return { x: horizontal[placement], y: vertical[placement], width, height };
}

/**
 * How far a box reaches outside the bounds, as an area-like cost.
 *
 * @param box - The box.
 * @param bounds - The bounds.
 */
function outside(box: Box, bounds: Box): number {
  const inside = overlapArea(box, bounds);
  return box.width * box.height - inside;
}

/**
 * The total size of a cluster's members.
 *
 * @param cluster - The cluster.
 */
function extent(cluster: { members: readonly DodgeItem[] }): number {
  return cluster.members.reduce((sum, member) => sum + member.size, 0);
}

/**
 * The start of a run of labels packed edge to edge and centred on their targets' mean.
 *
 * @param members - The labels, in target order.
 */
function centredStart(members: readonly DodgeItem[]): number {
  const mean = members.reduce((sum, member) => sum + member.target, 0) / members.length;
  const size = members.reduce((sum, member) => sum + member.size, 0);
  return mean - size / 2;
}

/**
 * The indexes of labels to show along an axis so none touches the next, evenly spaced: every one
 * when they fit, else every n-th. The run ends on the last label (the latest period, where the data
 * ends) and starts on the first when the step divides evenly; otherwise it starts wherever the even
 * step from the last lands, so the gaps never change size.
 *
 * @param positions - Each label's centre.
 * @param widths - Each label's width.
 * @param gap - The least space between labels.
 * @returns The indexes to show, in order.
 */
export function thinLabels(
  positions: readonly number[],
  widths: readonly number[],
  gap: number,
): number[] {
  const count = positions.length;
  const last = count - 1;
  for (let every = 1; every <= Math.max(1, count); every += 1) {
    const picked: number[] = [];
    for (let index = last % every; index <= last; index += every) {
      picked.push(index);
    }

    const fits = picked.every((index, position) => {
      const next = picked[position + 1];
      return next === undefined || fitsBetween(index, next, positions, widths, gap);
    });
    if (fits) {
      return picked;
    }
  }

  return count === 0 ? [] : [last];
}

/**
 * Whether two labels leave a gap between them.
 *
 * @param a - The first label's index.
 * @param b - The second's.
 * @param positions - The centres.
 * @param widths - The widths.
 * @param gap - The least gap.
 */
function fitsBetween(
  a: number,
  b: number,
  positions: readonly number[],
  widths: readonly number[],
  gap: number,
): boolean {
  const right = (positions[a] ?? 0) + (widths[a] ?? 0) / 2;
  const left = (positions[b] ?? 0) - (widths[b] ?? 0) / 2;
  return left - right >= gap;
}
import { pushAll } from '#foundation/lists.ts';
