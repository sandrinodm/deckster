/**
 * A node of a tree, by id with its children.
 */
export type TreeShape = {
  /**
   * The node's id.
   */
  id: string;

  /**
   * Its children, in order.
   */
  children: readonly TreeShape[];
};

/**
 * Where a tree node sits: its depth (1 for the root) and its place across (1 for the first leaf; a
 * parent sits midway between its first and last child, so it may be a half).
 */
export type TreeCell = {
  /**
   * The level, from 1 at the root.
   */
  depth: number;

  /**
   * The place across the levels, from 1.
   */
  across: number;
};

/**
 * Lays out a tree on a grid: leaves take consecutive places across in reading order, and each
 * parent sits over its middle child (between the two middle ones for an even count), so subtrees
 * never overlap, siblings sit evenly and the edge to a middle child runs straight down.
 *
 * @param roots - The trees, in order; several roots sit side by side.
 * @returns Each node's cell, by id.
 */
export function treeCells(roots: readonly TreeShape[]): Map<string, TreeCell> {
  const cells = new Map<string, TreeCell>();
  let nextLeaf = 1;
  /**
   * Places a subtree and returns where its root sits across.
   */
  const place = (node: TreeShape, depth: number): number => {
    if (node.children.length === 0) {
      const across = nextLeaf;
      nextLeaf += 1;
      cells.set(node.id, { depth, across });
      return across;
    }

    const places = node.children.map((child) => place(child, depth + 1));
    const across = middleOf(places);
    cells.set(node.id, { depth, across });
    return across;
  };
  for (const root of roots) {
    place(root, 1);
  }

  return cells;
}

/**
 * The middle of a parent's children: the middle one's place, or halfway between the two middle
 * ones.
 *
 * @param places - The children's places, in order.
 */
function middleOf(places: readonly number[]): number {
  const half = Math.floor(places.length / 2);
  if (places.length % 2 === 1) {
    return places[half] ?? 1;
  }

  return ((places[half - 1] ?? 1) + (places[half] ?? 1)) / 2;
}
