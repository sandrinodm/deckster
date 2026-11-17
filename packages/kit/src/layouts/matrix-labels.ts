/**
 * The sides of its dot a name can stand on, in the order they are tried when all else is equal:
 * beside the dot first, where a name reads with it, then above and below, then the corners.
 */
export const LABEL_SIDES = [
  'right',
  'left',
  'top',
  'bottom',
  'top-right',
  'bottom-right',
  'top-left',
  'bottom-left',
] as const;

/**
 * The most sides the search tries before it settles for the best arrangement it has found, so a
 * crowded plot never stalls the slide.
 */
const SEARCH_BUDGET = 20_000;

/**
 * The cost of a name drawn over another name, a dot or a caption: a last resort, which `deck lint`
 * reports, taken only where no arrangement avoids it.
 */
const COLLISION_COST = 100;

/**
 * The cost of a name closer to another name, a dot or a caption than the room the plot keeps, but
 * not over it: legible, so it beats a collision, but never chosen where there is room.
 */
const CROWDING_COST = 12;

/**
 * The cost of a name that leaves the plot.
 */
const OUTSIDE_COST = 1000;

/**
 * The cost of a name that crosses one of the axes, against a cost of one per step down the list of
 * sides: a name should rather stand at a corner of its dot than have an axis line run through it.
 */
const AXIS_CROSSING_COST = 6;

/**
 * The cost of a name that stands nearly as close to another item's dot as to its own, where a
 * reader could take it for that item's name.
 */
const AMBIGUITY_COST = 4;

/**
 * How near another dot may come to a name, in gaps, before the name reads as that dot's.
 */
const AMBIGUOUS_GAPS = 3;

/**
 * The fraction of the radius a corner side moves along each axis, so a name at a corner keeps the
 * same distance from its dot as one beside it.
 */
const DIAGONAL = Math.SQRT1_2;

/**
 * How many gaps a name keeps from a caption or an end label. Captions keep twice the gap, so a name
 * never reads as part of one.
 */
const OBSTACLE_GAPS = 2;

/**
 * A box on the plot, in canvas pixels from its top-left corner.
 */
export type PlotBox = {
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
 * One of {@link LABEL_SIDES}.
 */
export type LabelSide = (typeof LABEL_SIDES)[number];

/**
 * One item's name to place: its dot's centre and radius and the name's measured size.
 */
export type LabelInput = {
  /**
   * The dot's centre, left to right.
   */
  cx: number;

  /**
   * The dot's centre, top to bottom.
   */
  cy: number;

  /**
   * The dot's radius, with its ring.
   */
  radius: number;

  /**
   * The name's width.
   */
  width: number;

  /**
   * The name's height.
   */
  height: number;
};

/**
 * Where one name was put.
 */
export type LabelPlacement = {
  /**
   * The side of its dot it stands on.
   */
  side: LabelSide;

  /**
   * Its box on the plot.
   */
  box: PlotBox;

  /**
   * Whether it is inside the plot and keeps its room from every other dot, every other name and
   * every obstacle; a name that is not was put where it crowds or collides least, and `deck lint`
   * reports it if it is drawn over other text.
   */
  clear: boolean;
};

/**
 * What the planner places names on.
 */
export type PlotLayout = {
  /**
   * The plot's width.
   */
  width: number;

  /**
   * The plot's height.
   */
  height: number;

  /**
   * The space between a dot and its name, and kept between two names.
   */
  gap: number;

  /**
   * Boxes names must stay clear of, such as the quadrant captions.
   */
  obstacles: readonly PlotBox[];

  /**
   * The names, in item order.
   */
  labels: readonly LabelInput[];

  /**
   * The index of the name placed first, which gets the best side: the item the slide is about.
   */
  first?: number | undefined;
};

/**
 * The size of a fixed label on the plot (a quadrant caption or an axis's end label), measured.
 */
export type FixedInput = {
  /**
   * The label's width.
   */
  width: number;

  /**
   * The label's height.
   */
  height: number;
};

/**
 * What the planner places the fixed labels on: the axis's end labels and the quadrant captions.
 */
export type FixedLayout = {
  /**
   * The plot's width.
   */
  width: number;

  /**
   * The plot's height.
   */
  height: number;

  /**
   * The room between a label and the plot's edges and axes.
   */
  pad: number;

  /**
   * The room kept between a label and a dot.
   */
  gap: number;

  /**
   * The labels at the low and the high end of the horizontal axis.
   */
  ends: readonly FixedInput[];

  /**
   * The four quadrant captions, top left, top right, bottom left, bottom right; none when the slide
   * has none.
   */
  captions: readonly FixedInput[];

  /**
   * The items' dots, which the fixed labels keep clear of.
   */
  dots: readonly LabelInput[];
};

/**
 * Where the fixed labels stand.
 */
export type FixedPlacement = {
  /**
   * The boxes of the horizontal axis's end labels, low then high.
   */
  ends: PlotBox[];

  /**
   * The boxes of the quadrant captions, in quadrant order.
   */
  captions: PlotBox[];
};

/**
 * One way to place one name: the side, its box and what it costs.
 */
type Candidate = {
  /**
   * The side.
   */
  side: LabelSide;

  /**
   * The box.
   */
  box: PlotBox;

  /**
   * Its cost on its own: its rank among the sides, plus the axes it crosses, a dot it could be
   * mistaken for, and what it runs into that never moves (the dots, the captions, the plot's
   * edge).
   */
  cost: number;

  /**
   * Whether it stays inside the plot and keeps its room from every other dot and obstacle.
   */
  free: boolean;
};

/**
 * Places every item's name on a side of its dot where it stays inside the plot and clear of the
 * dots, the other names and the obstacles, preferring the side beside the dot, names that do not
 * cross an axis and names no other dot could claim. It searches the sides of every name together
 * for the arrangement of lowest total cost, the subject first and then the names with the least
 * room, and cuts a branch once it costs more than the best arrangement found. Crowding and
 * collisions are costs rather than walls, so a plot too full for every name to stay clear still
 * gets the arrangement with the fewest of them; those names are marked, and `deck lint` reports any
 * that are drawn over each other. Pure, so it is tested without a browser; the layout gives it
 * sizes measured with layout geometry.
 *
 * @param plot - The plot's size, the gap, the obstacles and the names.
 * @returns One placement per name, in item order.
 */
export function placeLabels(plot: PlotLayout): LabelPlacement[] {
  const candidates = plot.labels.map((label) =>
    LABEL_SIDES.map((side, rank) => candidate(plot, label, side, rank)).toSorted(
      (a, b) => a.cost - b.cost,
    ),
  );
  const order = placementOrder(plot, candidates);
  const chosen = search(plot, candidates, order);
  return plot.labels.map((_, index) => {
    const pick = chosen[index];
    const others = chosen.filter((other, at) => at !== index && other !== undefined);
    const clash = others.some((other) => pairCost(pick?.box ?? emptyBox(), other.box, plot) > 0);
    return {
      side: pick?.side ?? 'right',
      box: pick?.box ?? emptyBox(),
      clear: pick !== undefined && pick.free && !clash,
    };
  });
}

/**
 * Places the labels that belong to the plot rather than to an item. The horizontal axis's end
 * labels stand inside the plot at its two ends, just above the axis line, or just below it where a
 * dot stands above. Each quadrant caption stands in its quadrant's outer corner or, where a dot or
 * an end label is there, on the same edge next to the vertical axis; a caption with no clear place
 * keeps the corner.
 *
 * @param layout - The plot's size, the room to keep, the labels and the dots.
 * @returns The boxes of the end labels and of the captions.
 */
export function placeFixed(layout: FixedLayout): FixedPlacement {
  const { width, height, pad } = layout;
  /**
   * Whether a box keeps its room from every dot and from the labels already placed.
   *
   * @param box - The box.
   * @param others - The labels already placed.
   */
  const clearOf = (box: PlotBox, others: readonly PlotBox[]): boolean =>
    layout.dots.every((dot) => !boxesOverlap(box, dotBox(dot), layout.gap)) &&
    others.every((other) => !boxesOverlap(box, other, layout.gap));
  const ends = layout.ends.map((end, index) => {
    const x = index === 0 ? pad : width - pad - end.width;
    const options = [height / 2 - pad / 2 - end.height, height / 2 + pad / 2].map((y) =>
      roundBox({ x, y, width: end.width, height: end.height }),
    );
    return options.find((box) => clearOf(box, [])) ?? options[0] ?? emptyBox();
  });
  const captions = layout.captions.map((caption, index) => {
    const left = index % 2 === 0;
    const top = index < 2;
    const y = top ? pad : height - pad - caption.height;
    const options = [
      left ? pad : width - pad - caption.width,
      left ? width / 2 - pad - caption.width : width / 2 + pad,
    ].map((x) => roundBox({ x, y, width: caption.width, height: caption.height }));
    return options.find((box) => clearOf(box, ends)) ?? options[0] ?? emptyBox();
  });
  return { ends, captions };
}

/**
 * Whether two boxes overlap once one is grown by a margin on every side.
 *
 * @param a - One box.
 * @param b - The other.
 * @param margin - The room to keep between them.
 */
export function boxesOverlap(a: PlotBox, b: PlotBox, margin = 0): boolean {
  return (
    a.x < b.x + b.width + margin &&
    b.x < a.x + a.width + margin &&
    a.y < b.y + b.height + margin &&
    b.y < a.y + a.height + margin
  );
}

/**
 * The box of a name on one side of its dot, and what that side costs.
 *
 * @param plot - The plot.
 * @param label - The name.
 * @param side - The side.
 * @param rank - The side's place in {@link LABEL_SIDES}.
 */
function candidate(plot: PlotLayout, label: LabelInput, side: LabelSide, rank: number): Candidate {
  const reach = label.radius + plot.gap;
  const corner = label.radius * DIAGONAL + plot.gap / 2;
  const { cx, cy, width, height } = label;
  const boxes: Record<LabelSide, PlotBox> = {
    right: { x: cx + reach, y: cy - height / 2, width, height },
    left: { x: cx - reach - width, y: cy - height / 2, width, height },
    top: { x: cx - width / 2, y: cy - reach - height, width, height },
    bottom: { x: cx - width / 2, y: cy + reach, width, height },
    'top-right': { x: cx + corner, y: cy - corner - height, width, height },
    'bottom-right': { x: cx + corner, y: cy + corner, width, height },
    'top-left': { x: cx - corner - width, y: cy - corner - height, width, height },
    'bottom-left': { x: cx - corner - width, y: cy + corner, width, height },
  };
  const box = roundBox(boxes[side]);
  const crossings = AXIS_CROSSING_COST * axesCrossed(box, plot);
  const ambiguity = isAmbiguous(box, label, plot) ? AMBIGUITY_COST : 0;
  const inside = fitsPlot(box, plot);
  const fixed = fixedCost(box, label, plot);
  const cost = rank + crossings + ambiguity + (inside ? 0 : OUTSIDE_COST) + fixed;
  return { side, box, cost, free: inside && fixed === 0 };
}

/**
 * How many of the two centre lines a box crosses.
 *
 * @param box - The box.
 * @param plot - The plot.
 */
function axesCrossed(box: PlotBox, plot: PlotLayout): number {
  const middleX = plot.width / 2;
  const middleY = plot.height / 2;
  const vertical = box.x < middleX && box.x + box.width > middleX ? 1 : 0;
  const horizontal = box.y < middleY && box.y + box.height > middleY ? 1 : 0;
  return vertical + horizontal;
}

/**
 * Whether another item's dot stands within a few gaps of a name, so the name could be read as that
 * item's.
 *
 * @param box - The name's box.
 * @param own - The name's own item.
 * @param plot - The plot.
 */
function isAmbiguous(box: PlotBox, own: LabelInput, plot: PlotLayout): boolean {
  return plot.labels.some((other) => {
    if (other === own) {
      return false;
    }

    const dx = Math.max(box.x - other.cx, 0, other.cx - (box.x + box.width));
    const dy = Math.max(box.y - other.cy, 0, other.cy - (box.y + box.height));
    return Math.hypot(dx, dy) - other.radius < AMBIGUOUS_GAPS * plot.gap;
  });
}

/**
 * Whether a box lies inside the plot.
 *
 * @param box - The box.
 * @param plot - The plot.
 */
function fitsPlot(box: PlotBox, plot: PlotLayout): boolean {
  return (
    box.x >= 0 && box.y >= 0 && box.x + box.width <= plot.width && box.y + box.height <= plot.height
  );
}

/**
 * What a name's box costs for the things that never move: each other dot and each obstacle it runs
 * into or crowds. Its own dot is left out: the box is set at a gap from it by construction.
 *
 * @param box - The box.
 * @param own - The name's own item.
 * @param plot - The plot.
 */
function fixedCost(box: PlotBox, own: LabelInput, plot: PlotLayout): number {
  const dots = plot.labels
    .filter((label) => label !== own)
    .map((label) => contactCost(box, dotBox(label), plot.gap / 2));
  const obstacles = plot.obstacles.map((obstacle) =>
    contactCost(box, obstacle, OBSTACLE_GAPS * plot.gap),
  );
  return [...dots, ...obstacles].reduce((sum, cost) => sum + cost, 0);
}

/**
 * The square around a dot.
 *
 * @param label - The dot's item.
 */
function dotBox(label: LabelInput): PlotBox {
  return {
    x: label.cx - label.radius,
    y: label.cy - label.radius,
    width: 2 * label.radius,
    height: 2 * label.radius,
  };
}

/**
 * The cost of a box against something it must keep clear of: a collision when they overlap,
 * crowding when they come closer than the room to keep, else nothing.
 *
 * @param box - The box.
 * @param other - What it must keep clear of.
 * @param room - The room to keep.
 */
function contactCost(box: PlotBox, other: PlotBox, room: number): number {
  if (boxesOverlap(box, other)) {
    return COLLISION_COST;
  }

  return boxesOverlap(box, other, room) ? CROWDING_COST : 0;
}

/**
 * What two names cost together: a collision when they overlap, crowding when they come closer than
 * the gap.
 *
 * @param a - One name's box.
 * @param b - The other's.
 * @param plot - The plot.
 */
function pairCost(a: PlotBox, b: PlotBox, plot: PlotLayout): number {
  return contactCost(a, b, plot.gap);
}

/**
 * The order the search places names in: the subject first when the plot names one, then the names
 * with the fewest sides left, then the rest in item order.
 *
 * @param plot - The plot.
 * @param candidates - Each name's clear sides, cheapest first.
 */
function placementOrder(plot: PlotLayout, candidates: readonly Candidate[][]): number[] {
  return plot.labels
    .map((_, index) => index)
    .toSorted((a, b) => {
      if (a === plot.first || b === plot.first) {
        return a === plot.first ? -1 : 1;
      }

      return roomOf(candidates[a]) - roomOf(candidates[b]) || a - b;
    });
}

/**
 * How many sides a name has that run into nothing.
 *
 * @param options - The name's sides.
 */
function roomOf(options: readonly Candidate[] | undefined): number {
  return (options ?? []).filter((option) => option.free).length;
}

/**
 * A depth-first search for the side of every name with the lowest total cost, cheapest sides first,
 * so its first arrangement is the greedy one; it drops a branch once it costs as much as the best
 * arrangement found and stops after a budget of tries with the best it has.
 *
 * @param plot - The plot.
 * @param candidates - Each name's sides, cheapest first.
 * @param order - The order to place the names in.
 * @returns The chosen candidate of every name, by item index.
 */
function search(
  plot: PlotLayout,
  candidates: readonly Candidate[][],
  order: readonly number[],
): Candidate[] {
  const chosen: Candidate[] = [];
  let best: Candidate[] = [];
  let bestCost = Number.POSITIVE_INFINITY;
  let tries = 0;
  /**
   * Places the name at `depth` in the order and every one after it.
   *
   * @param depth - How many names are placed.
   * @param cost - What the names placed so far cost.
   */
  const place = (depth: number, cost: number): void => {
    const index = order[depth];
    if (index === undefined) {
      best = [...chosen];
      bestCost = cost;
      return;
    }

    for (const option of candidates[index] ?? []) {
      tries += 1;
      if ((tries > SEARCH_BUDGET && best.length > 0) || cost + option.cost >= bestCost) {
        return;
      }

      const shared = order
        .slice(0, depth)
        .reduce(
          (sum, placed) => sum + pairCost(option.box, chosen[placed]?.box ?? emptyBox(), plot),
          0,
        );
      if (cost + option.cost + shared < bestCost) {
        chosen[index] = option;
        place(depth + 1, cost + option.cost + shared);
      }
    }
  };
  place(0, 0);
  return best;
}

/**
 * A box with its edges on whole pixels, so a placement renders the same on every pass.
 *
 * @param box - The box.
 */
function roundBox(box: PlotBox): PlotBox {
  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.ceil(box.width),
    height: Math.ceil(box.height),
  };
}

/**
 * A box of no size at the plot's origin.
 */
function emptyBox(): PlotBox {
  return { x: 0, y: 0, width: 0, height: 0 };
}
