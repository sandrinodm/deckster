import { describe, expect, it } from 'vite-plus/test';

import { accentRect } from '#diagrams/flow-node-view.tsx';
import { cardShape, nodeGeometry, roundRect, shapeGeometry } from '#diagrams/node-shapes.ts';

/**
 * A node's box.
 */
const RECT = { x: 10, y: 20, width: 200, height: 80 };

describe('cardShape', () => {
  it("keeps the kind's shape, or draws a box or a pill", () => {
    expect(cardShape('cylinder', 'kind')).toBe('cylinder');
    expect(cardShape('cylinder', 'box')).toBe('card');
    expect(cardShape('hexagon', 'pill')).toBe('pill');
  });

  it('keeps an external node dashed under a box', () => {
    expect(cardShape('dashed', 'box')).toBe('dashed');
  });
});

describe('nodeGeometry', () => {
  it("draws the kind's shape with the card's radius", () => {
    const geometry = nodeGeometry('card', { shape: 'kind', radius: 0 }, RECT);
    expect(geometry.outline).toBe(roundRect(RECT, 0));
    expect(geometry.radius).toBe(0);
  });

  it('is exactly the shape geometry when the card keeps the kind and the medium radius', () => {
    expect(nodeGeometry('cylinder', { shape: 'kind', radius: 12 }, RECT)).toEqual(
      shapeGeometry('cylinder', RECT, 12),
    );
  });

  it("replaces the kind's shape with a box, dropping its insets", () => {
    const geometry = nodeGeometry('cylinder', { shape: 'box', radius: 8 }, RECT);
    expect(geometry.described).toBe('roundRect');
    expect(geometry.inset).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('keeps a dashed kind dashed whatever shape the card gives it', () => {
    expect(nodeGeometry('dashed', { shape: 'pill', radius: 8 }, RECT).dashed).toBe(true);
    expect(nodeGeometry('dashed', { shape: 'box', radius: 8 }, RECT).dashed).toBe(true);
  });
});

describe('accentRect', () => {
  const none = { top: 0, right: 0, bottom: 0, left: 0 };

  it('runs along the side, as deep as its width', () => {
    expect(accentRect({ side: 'left', width: 6 }, RECT, none)).toEqual({
      x: 10,
      y: 20,
      width: 6,
      height: 80,
    });
    expect(accentRect({ side: 'bottom', width: 4 }, RECT, none)).toEqual({
      x: 10,
      y: 96,
      width: 200,
      height: 4,
    });
  });

  it("reaches past the room the shape takes on that side, such as a cylinder's lid", () => {
    expect(accentRect({ side: 'top', width: 4 }, RECT, { ...none, top: 20 })?.height).toBe(24);
  });

  it('draws nothing without a side', () => {
    expect(accentRect({ side: 'none', width: 4 }, RECT, none)).toBeUndefined();
  });
});
