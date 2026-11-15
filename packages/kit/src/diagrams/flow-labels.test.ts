import { describe, expect, it } from 'vite-plus/test';

import { labelLayout, labelLines, placeLabels } from '#diagrams/flow-labels.ts';
import { intersects } from '#diagrams/geometry.ts';
import { roundedPath } from '#diagrams/path-geometry.ts';

/**
 * The diagram's box.
 */
const BOUNDS = { x: 0, y: 0, width: 1600, height: 800 };

describe('placeLabels', () => {
  it('puts a label above a horizontal run, clear of the line', () => {
    const points = [
      { x: 300, y: 400 },
      { x: 600, y: 400 },
    ];
    const [label] = placeLabels(
      [{ id: 'e', width: 80, height: 32, points, segments: roundedPath(points, 0) }],
      [],
      BOUNDS,
    );
    expect(label?.overlaps).toBe(false);
    expect((label?.rect.y ?? 0) + (label?.rect.height ?? 0)).toBeLessThan(400);
    expect((label?.rect.x ?? 0) + 40).toBeCloseTo(450);
  });

  it('keeps labels off nodes and off each other', () => {
    const a = [
      { x: 300, y: 400 },
      { x: 600, y: 400 },
    ];
    const b = [
      { x: 300, y: 520 },
      { x: 600, y: 520 },
    ];
    const node = { x: 420, y: 330, width: 60, height: 40 };
    const placed = placeLabels(
      [
        { id: 'a', width: 80, height: 32, points: a, segments: roundedPath(a, 0) },
        { id: 'b', width: 80, height: 32, points: b, segments: roundedPath(b, 0) },
      ],
      [node],
      BOUNDS,
    );
    const [first, second] = placed;
    expect(first && intersects(first.rect, node)).toBe(false);
    expect(first && second && intersects(first.rect, second.rect)).toBe(false);
    expect(placed.every((label) => !label.overlaps)).toBe(true);
  });

  it('puts a label to the right of a vertical run', () => {
    const points = [
      { x: 500, y: 100 },
      { x: 500, y: 500 },
    ];
    const [label] = placeLabels(
      [{ id: 'e', width: 80, height: 32, points, segments: roundedPath(points, 0) }],
      [],
      BOUNDS,
    );
    expect(label?.rect.x).toBeGreaterThan(500);
  });

  it('marks a label it cannot place clear of everything', () => {
    const points = [
      { x: 300, y: 400 },
      { x: 360, y: 400 },
    ];
    const wall = { x: 0, y: 0, width: 1600, height: 800 };
    const [label] = placeLabels(
      [{ id: 'e', width: 80, height: 32, points, segments: roundedPath(points, 0) }],
      [wall],
      BOUNDS,
    );
    expect(label?.overlaps).toBe(true);
  });
});

/**
 * A width of ten pixels per character.
 *
 * @param text - Any text.
 */
function tenPerChar(text: string): number {
  return text.length * 10;
}

describe('labelLines', () => {
  it('keeps a short label on one line', () => {
    expect(labelLines('SQL', tenPerChar, 180)).toEqual(['SQL']);
  });

  it('wraps a long label between words onto two lines', () => {
    expect(labelLines('a really very long label', tenPerChar, 180)).toEqual([
      'a really very long',
      'label',
    ]);
  });

  it('breaks a long identifier at a camelCase boundary and keeps its start and end when cut', () => {
    const layout = labelLayout(
      'OrderCancelledAfterShipmentEvent published to topic',
      tenPerChar,
      180,
    );
    expect(layout.lines).toEqual(['OrderCancelled', 'AfterShipment…']);
    expect(labelLines('OrderCancelledAfterShipmentEvent', tenPerChar, 120)).toEqual([
      'Order',
      'Cancel…Event',
    ]);
    expect(layout).toMatchObject({ broken: true, truncated: true });
    expect(layout.lines.every((line) => tenPerChar(line) <= 180)).toBe(true);
  });

  it('never breaks a word at an arbitrary letter, nor leaves a short piece on a line', () => {
    const layout = labelLayout('Supercalifragilisticexpialidocious', tenPerChar, 180);
    expect(layout.lines).toHaveLength(1);
    expect(layout.lines[0]).toMatch(/^\S{3,}…\S{3,}$/);
    expect(layout.truncated).toBe(true);
    for (const line of labelLines('see order-fulfilment-events-v2 now', tenPerChar, 180)) {
      expect(line.replace('…', '').length).toBeGreaterThanOrEqual(3);
    }
  });

  it('ends a cut run of words after a whole word', () => {
    expect(labelLines('one two three four five six seven eight nine', tenPerChar, 100)).toEqual([
      'one two',
      'three…',
    ]);
  });
});
