import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { fieldLimitBreaches, slideFieldLimits } from '@deckster/engine/layout';
import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import catalog from '#catalog.ts';
import { LIMIT_CASES } from '#layouts/limit-cases.ts';
import { boxesOverlap, placeFixed, placeLabels, type LabelInput } from '#layouts/matrix-labels.ts';
import {
  matrixLayoutContract,
  matrixProblems,
  MATRIX_ITEM_MAX_CHARS_CROWDED,
  quadrantOf,
} from '#layouts/matrix-layout.contract.ts';

/**
 * The axes of a map of peer cities.
 */
const AXES = {
  x: { low: 'Slow to plant', high: 'Fast to plant' },
  y: { low: 'Trees die young', high: 'Trees survive' },
};

/**
 * Three items, the first marked as ours.
 */
const ITEMS = [
  { name: 'Larkfield', x: 80, y: 82, us: true },
  { name: 'Harrowgate', x: 30, y: 70 },
  { name: 'Elmsford', x: 72, y: 28 },
];

/**
 * Decodes frontmatter as the build does: the fields every slide has plus the matrix layout's.
 *
 * @param frontmatter - The slide's fields without `layout`.
 */
function decode(frontmatter: Record<string, unknown>): unknown {
  const schema = Schema.Struct({
    ...SlideFrontmatter.fields,
    ...matrixLayoutContract.schema.fields,
  });
  return Schema.decodeUnknownSync(schema)(
    { layout: 'matrix', ...frontmatter },
    { onExcessProperty: 'error' },
  );
}

/**
 * A name to place: a dot of radius 10 at a point, its name 100 by 30.
 *
 * @param cx - The dot's centre, left to right.
 * @param cy - The dot's centre, top to bottom.
 */
function label(cx: number, cy: number): LabelInput {
  return { cx, cy, radius: 10, width: 100, height: 30 };
}

describe('the matrix layout contract', () => {
  it('takes two labelled axes and three to ten items placed from 0 to 100', () => {
    expect(() => decode({ ...AXES, items: ITEMS })).not.toThrow();
    expect(() => decode({ ...AXES, items: ITEMS.slice(0, 2) })).toThrow('at least 3 items');
    const eleven = Array.from({ length: 11 }, (_, index) => ({ name: 'A', x: index * 9, y: 50 }));
    expect(() => decode({ ...AXES, items: eleven })).toThrow('at most 10 items');
    expect(() => decode({ ...AXES, items: [...ITEMS, { name: 'Off', x: 120, y: 5 }] })).toThrow(
      'from 0 (the low end) to 100',
    );
    expect(() => decode({ x: AXES.x, items: ITEMS })).toThrow('Missing key');
  });

  it('takes exactly four quadrant captions, or none', () => {
    const quadrants = ['Careful but slow', 'Where we want to be', 'Stalled', 'Planting to lose'];
    expect(() => decode({ ...AXES, items: ITEMS, quadrants })).not.toThrow();
    expect(() => decode({ ...AXES, items: ITEMS, quadrants: quadrants.slice(1) })).toThrow(
      'top-left, top-right, bottom-left, bottom-right',
    );
  });

  it('allows one item marked us, and no two items on top of each other', () => {
    expect(matrixProblems(ITEMS)).toEqual([]);
    const twice = [...ITEMS, { name: 'Northmoor', x: 10, y: 10, us: true }];
    expect(matrixProblems(twice).map((problem) => problem.path)).toEqual(['items[3].us']);
    const stacked = [...ITEMS, { name: 'Castlebridge', x: 78, y: 80 }];
    const [problem] = matrixProblems(stacked);
    expect(problem?.path).toBe('items[3]');
    expect(problem?.message).toContain('"Larkfield"');
  });

  it('holds names shorter once seven items crowd the plot', () => {
    const long = 'x'.repeat(MATRIX_ITEM_MAX_CHARS_CROWDED + 1);
    const items = (count: number) =>
      Array.from({ length: count }, (_, index) => ({ name: long, x: index * 12, y: 50 }));
    const breaches = (count: number) =>
      fieldLimitBreaches(
        { items: items(count) },
        slideFieldLimits(matrixLayoutContract, {
          frontmatter: { items: items(count) },
          filled: [],
        }),
      );
    expect(breaches(6)).toEqual([]);
    expect(breaches(7)).toHaveLength(7);
  });

  it('names the quadrant of a position, and none on a centre line', () => {
    expect(quadrantOf(80, 82)).toBe('top-right');
    expect(quadrantOf(20, 10)).toBe('bottom-left');
    expect(quadrantOf(50, 70)).toBeUndefined();
  });

  it('is listed in the catalog after comparison, with an example and limit cases', () => {
    const names = catalog.layouts.map((contract) => contract.name);
    expect(names.indexOf('matrix')).toBe(names.indexOf('comparison') + 1);
    expect(() => decode(matrixLayoutContract.example.frontmatter)).not.toThrow();
    expect(matrixLayoutContract.example.body).toContain('<Notes>');
    expect(matrixLayoutContract.description.length).toBeGreaterThan(200);
    expect(LIMIT_CASES['matrix']?.length).toBe(3);
  });
});

describe('the matrix label planner', () => {
  it('sets a name beside its dot, on the right, when there is room', () => {
    const [placement] = placeLabels({
      width: 600,
      height: 600,
      gap: 8,
      obstacles: [],
      labels: [label(150, 150)],
    });
    expect(placement).toMatchObject({ side: 'right', clear: true });
    expect(placement?.box).toEqual({ x: 168, y: 135, width: 100, height: 30 });
  });

  it('keeps names inside the plot, clear of the axes when it can', () => {
    const [edge, axis] = placeLabels({
      width: 600,
      height: 600,
      gap: 8,
      obstacles: [],
      labels: [label(560, 100), label(250, 150)],
    });
    expect(edge?.side).toBe('left');
    expect(axis?.side).toBe('left');
  });

  it('keeps names clear of each other, the dots and the obstacles', () => {
    const labels = [label(150, 150), label(290, 150), label(150, 210), label(420, 420)];
    const obstacles = [{ x: 400, y: 340, width: 180, height: 60 }];
    const placements = placeLabels({ width: 600, height: 600, gap: 8, obstacles, labels });
    expect(placements.every((placement) => placement.clear)).toBe(true);
    for (const [index, placement] of placements.entries()) {
      for (const other of placements.slice(index + 1)) {
        expect(boxesOverlap(placement.box, other.box)).toBe(false);
      }

      for (const obstacle of obstacles) {
        expect(boxesOverlap(placement.box, obstacle)).toBe(false);
      }
    }
  });

  it('gives the subject its best side before the others', () => {
    const labels = [label(150, 150), label(290, 150)];
    const placements = placeLabels({
      width: 600,
      height: 600,
      gap: 8,
      obstacles: [],
      labels,
      first: 1,
    });
    expect(placements[1]?.side).toBe('right');
  });

  it('reports a name it cannot keep clear on a plot too small for them all', () => {
    const labels = [label(30, 30), label(60, 40), label(40, 70)];
    const placements = placeLabels({ width: 100, height: 100, gap: 8, obstacles: [], labels });
    expect(placements.some((placement) => !placement.clear)).toBe(true);
  });
});

describe('the matrix planner of the fixed labels', () => {
  const layout = {
    width: 600,
    height: 600,
    pad: 16,
    gap: 8,
    ends: [
      { width: 120, height: 24 },
      { width: 140, height: 24 },
    ],
    captions: Array.from({ length: 4 }, () => ({ width: 160, height: 60 })),
  };

  it('sets the axis labels above the axis at its ends and the captions in the outer corners', () => {
    const { ends, captions } = placeFixed({ ...layout, dots: [] });
    expect(ends).toEqual([
      { x: 16, y: 268, width: 120, height: 24 },
      { x: 444, y: 268, width: 140, height: 24 },
    ]);
    expect(captions.map((box) => [box.x, box.y])).toEqual([
      [16, 16],
      [424, 16],
      [16, 524],
      [424, 524],
    ]);
  });

  it('moves a label off a dot that stands where it would go', () => {
    const corner = placeFixed({ ...layout, dots: [label(60, 40)] }).captions;
    expect([corner[0]?.x, corner[0]?.y]).toEqual([124, 16]);
    const end = placeFixed({ ...layout, dots: [label(40, 285)] }).ends;
    expect(end[0]?.y).toBe(308);
  });
});
