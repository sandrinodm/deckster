/**
 * A point in diagram pixels, from the diagram's top-left corner.
 */
export type Point = {
  /**
   * Distance from the left edge.
   */
  x: number;

  /**
   * Distance from the top edge.
   */
  y: number;
};

/**
 * An axis-aligned rectangle in diagram pixels.
 */
export type Rect = {
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
 * A side of a rectangle, where an edge leaves or enters a node.
 */
export type Side = 'top' | 'right' | 'bottom' | 'left';

/**
 * Every side, clockwise from the top.
 */
export const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'];

/**
 * How close two coordinates must be to count as equal, in pixels.
 */
export const EPSILON = 0.5;

/**
 * The centre of a rectangle.
 *
 * @param rect - Any rectangle.
 */
export function centerOf(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/**
 * A rectangle grown by `by` on every side; a negative value shrinks it.
 *
 * @param rect - Any rectangle.
 * @param by - Pixels to add on each side.
 */
export function inflate(rect: Rect, by: number): Rect {
  return {
    x: rect.x - by,
    y: rect.y - by,
    width: rect.width + 2 * by,
    height: rect.height + 2 * by,
  };
}

/**
 * Whether two rectangles overlap by more than {@link EPSILON}; touching edges do not count.
 *
 * @param a - A rectangle.
 * @param b - Another rectangle.
 */
export function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x + a.width - EPSILON > b.x &&
    b.x + b.width - EPSILON > a.x &&
    a.y + a.height - EPSILON > b.y &&
    b.y + b.height - EPSILON > a.y
  );
}

/**
 * Whether `inner` lies inside `outer`, edges included.
 *
 * @param outer - The containing rectangle.
 * @param inner - The rectangle that should be inside it.
 */
export function containsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x - EPSILON &&
    inner.y >= outer.y - EPSILON &&
    inner.x + inner.width <= outer.x + outer.width + EPSILON &&
    inner.y + inner.height <= outer.y + outer.height + EPSILON
  );
}

/**
 * Whether a point lies strictly inside a rectangle.
 *
 * @param rect - The rectangle.
 * @param point - The point.
 */
export function containsPoint(rect: Rect, point: Point): boolean {
  return (
    point.x > rect.x + EPSILON &&
    point.x < rect.x + rect.width - EPSILON &&
    point.y > rect.y + EPSILON &&
    point.y < rect.y + rect.height - EPSILON
  );
}

/**
 * The smallest rectangle that covers every rectangle given.
 *
 * @param rects - At least one rectangle.
 * @returns The union; a zero rectangle at the origin for an empty list.
 */
export function unionOf(rects: readonly Rect[]): Rect {
  if (rects.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const left = minOf(rects.map((rect) => rect.x));
  const top = minOf(rects.map((rect) => rect.y));
  const right = maxOf(rects.map((rect) => rect.x + rect.width));
  const bottom = maxOf(rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Whether an axis-aligned segment passes through the inside of a rectangle. Running along an edge
 * of the rectangle does not count.
 *
 * @param from - One end of a horizontal or vertical segment.
 * @param to - The other end.
 * @param rect - The rectangle.
 */
export function segmentCrossesRect(from: Point, to: Point, rect: Rect): boolean {
  const left = Math.min(from.x, to.x);
  const right = Math.max(from.x, to.x);
  const top = Math.min(from.y, to.y);
  const bottom = Math.max(from.y, to.y);
  return (
    right > rect.x + EPSILON &&
    left < rect.x + rect.width - EPSILON &&
    bottom > rect.y + EPSILON &&
    top < rect.y + rect.height - EPSILON
  );
}

/**
 * The point on a side of a rectangle at a distance along it, measured from its top or left end.
 *
 * @param rect - The rectangle.
 * @param side - The side.
 * @param offset - Pixels along the side.
 */
export function pointOnSide(rect: Rect, side: Side, offset: number): Point {
  switch (side) {
    case 'top':
      return { x: rect.x + offset, y: rect.y };
    case 'bottom':
      return { x: rect.x + offset, y: rect.y + rect.height };
    case 'left':
      return { x: rect.x, y: rect.y + offset };
    case 'right':
      return { x: rect.x + rect.width, y: rect.y + offset };
  }
}

/**
 * The unit vector pointing out of a rectangle through a side.
 *
 * @param side - The side.
 */
export function normalOf(side: Side): Point {
  switch (side) {
    case 'top':
      return { x: 0, y: -1 };
    case 'bottom':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
  }
}

/**
 * Whether a side runs horizontally (top and bottom).
 *
 * @param side - The side.
 */
export function isHorizontalSide(side: Side): boolean {
  return side === 'top' || side === 'bottom';
}

/**
 * The length of a side.
 *
 * @param rect - The rectangle.
 * @param side - The side.
 */
export function sideLength(rect: Rect, side: Side): number {
  return isHorizontalSide(side) ? rect.width : rect.height;
}

/**
 * The distance between two points.
 *
 * @param a - A point.
 * @param b - Another point.
 */
export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * The factor that moves two decimal places into the integer part and back.
 */
const TWO_DECIMAL_FACTOR = 100;

/**
 * Rounds a number to two decimals, for stable output in descriptions and tests.
 *
 * @param value - Any number.
 */
export function round2(value: number): number {
  return Math.round(value * TWO_DECIMAL_FACTOR) / TWO_DECIMAL_FACTOR;
}
import { maxOf, minOf } from '#foundation/lists.ts';
