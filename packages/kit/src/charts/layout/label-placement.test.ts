import { describe, expect, it } from 'vite-plus/test';

import { TEST_THEME, testMeasure } from '#charts/frame/chart-theme.fixture.ts';
import { boxesOverlap, dodge, overlapArea, placeLabels } from '#charts/layout/label-placement.ts';
import { wrapText } from '#charts/layout/text-measure.ts';

describe('dodge', () => {
  it('leaves labels that do not collide where they want to be', () => {
    expect(
      dodge(
        [
          { target: 100, size: 30 },
          { target: 300, size: 30 },
        ],
        0,
        600,
      ),
    ).toEqual([100, 300]);
  });

  it('spreads colliding labels around their mean, edge to edge, in order', () => {
    const centres = dodge(
      [
        { target: 200, size: 30 },
        { target: 205, size: 30 },
        { target: 210, size: 30 },
      ],
      0,
      600,
    );
    expect(centres).toEqual([175, 205, 235]);
  });

  it('keeps every label inside the room and apart', () => {
    const items = Array.from({ length: 6 }, (_, index) => ({ target: 590 + index, size: 40 }));
    const centres = dodge(items, 0, 600).toSorted((a, b) => a - b);
    expect(centres.at(-1)).toBeLessThanOrEqual(580);
    for (let index = 1; index < centres.length; index += 1) {
      expect((centres[index] ?? 0) - (centres[index - 1] ?? 0)).toBeGreaterThanOrEqual(40);
    }
  });

  it('returns centres in the order the labels were given', () => {
    const centres = dodge(
      [
        { target: 400, size: 20 },
        { target: 100, size: 20 },
      ],
      0,
      600,
    );
    expect(centres).toEqual([400, 100]);
  });
});

describe('placeLabels', () => {
  const bounds = { x: 0, y: 0, width: 1000, height: 600 };

  it('takes the first placement that covers nothing', () => {
    const [placed] = placeLabels(
      [{ anchor: { x: 500, y: 300 }, width: 100, height: 20 }],
      [],
      bounds,
      10,
    );
    expect(placed?.placement).toBe('above-right');
    expect(placed?.overlaps).toBe(false);
  });

  it('moves a label off an obstacle and off a label placed before it', () => {
    const obstacle = { x: 500, y: 250, width: 200, height: 60 };
    const placed = placeLabels(
      [
        { anchor: { x: 500, y: 300 }, width: 100, height: 20 },
        { anchor: { x: 500, y: 300 }, width: 100, height: 20 },
      ],
      [obstacle],
      bounds,
      10,
    );
    expect(placed.every((label) => !boxesOverlap(label.box, obstacle))).toBe(true);
    expect(overlapArea(placed[0]!.box, placed[1]!.box)).toBe(0);
  });

  it('stays inside the bounds near an edge', () => {
    const [placed] = placeLabels(
      [{ anchor: { x: 990, y: 5 }, width: 100, height: 20 }],
      [],
      bounds,
      10,
    );
    expect(placed?.box.x).toBeLessThanOrEqual(900);
    expect(placed?.box.y).toBeGreaterThanOrEqual(0);
  });

  it('marks a label that has nowhere free to go', () => {
    const wall = { x: 0, y: 0, width: 1000, height: 600 };
    const [placed] = placeLabels(
      [{ anchor: { x: 500, y: 300 }, width: 100, height: 20 }],
      [wall],
      bounds,
      10,
    );
    expect(placed?.overlaps).toBe(true);
  });
});

describe('wrapText', () => {
  it('breaks at spaces within the width and ends a cut text with an ellipsis', () => {
    const style = TEST_THEME.text.axis;
    const lines = wrapText('Questions answered by an article with no ticket after', 200, {
      measure: testMeasure,
      style,
      maxLines: 2,
    });
    expect(lines).toHaveLength(2);
    expect(lines[1]?.endsWith('…')).toBe(true);
    expect(wrapText('Short', 200, { measure: testMeasure, style, maxLines: 2 })).toEqual(['Short']);
  });
});
