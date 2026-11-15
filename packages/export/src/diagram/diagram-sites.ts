import type { SceneRect } from '#scene/scene.ts';
import type { Point } from '#vector/svg-path.ts';

/**
 * How far from a connection site, in canvas pixels, a route may end and still be glued to it: the
 * kit stops arrows a few pixels short of the node.
 */
export const SITE_TOLERANCE_PX = 6;

/**
 * The direction, in degrees clockwise from the positive x axis, that a connector leaves a site on
 * the top side of a box: up the slide.
 */
const ANGLE_UP_DEG = 270;

/**
 * The direction a connector leaves a site on the left side of a box: left.
 */
const ANGLE_LEFT_DEG = 180;

/**
 * The direction a connector leaves a site on the bottom side of a box: down the slide.
 */
const ANGLE_DOWN_DEG = 90;

/**
 * The direction a connector leaves a site on the right side of a box: right.
 */
const ANGLE_RIGHT_DEG = 0;

/**
 * A connection site of a shape: where a connector can be glued, by its index in the shape's
 * connection list.
 */
export type ConnectionSite = {
  /**
   * The index `a:stCxn` and `a:endCxn` refer to.
   */
  index: number;

  /**
   * Where it is on the slide.
   */
  x: number;

  /**
   * Where it is on the slide.
   */
  y: number;

  /**
   * The direction a connector leaves it, in degrees clockwise from the positive x axis.
   */
  angle: number;
};

/**
 * The sides of a box in the order rectangle-like presets list their sites: top, left, bottom,
 * right, with the direction a connector leaves each.
 *
 * @param box - The box.
 */
function sideSites(box: SceneRect): Omit<ConnectionSite, 'index'>[] {
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  return [
    { x: centerX, y: box.y, angle: ANGLE_UP_DEG },
    { x: box.x, y: centerY, angle: ANGLE_LEFT_DEG },
    { x: centerX, y: box.y + box.height, angle: ANGLE_DOWN_DEG },
    { x: box.x + box.width, y: centerY, angle: ANGLE_RIGHT_DEG },
  ];
}

/**
 * The connection sites of a preset shape in a box, in the order of its `cxnLst` in
 * `presetShapeDefinitions.xml` (ECMA-376 Part 1, Annex D): `rect`, `roundRect` and `diamond` have
 * the middles of their sides (top, left, bottom, right); `ellipse` has eight sites, from the top
 * anticlockwise. Other presets have none here: the writer draws those nodes from their outline.
 *
 * @param preset - The preset name.
 * @param box - The shape's box.
 */
export function presetSites(preset: string, box: SceneRect): ConnectionSite[] {
  if (preset === 'rect' || preset === 'roundRect' || preset === 'diamond') {
    return sideSites(box).map((site, index) => ({ ...site, index }));
  }

  if (preset !== 'ellipse') {
    return [];
  }

  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const dx = (box.width / 2) * Math.SQRT1_2;
  const dy = (box.height / 2) * Math.SQRT1_2;
  const sites: Omit<ConnectionSite, 'index'>[] = [
    { x: centerX, y: box.y, angle: ANGLE_UP_DEG },
    { x: centerX - dx, y: centerY - dy, angle: ANGLE_UP_DEG },
    { x: box.x, y: centerY, angle: ANGLE_LEFT_DEG },
    { x: centerX - dx, y: centerY + dy, angle: ANGLE_DOWN_DEG },
    { x: centerX, y: box.y + box.height, angle: ANGLE_DOWN_DEG },
    { x: centerX + dx, y: centerY + dy, angle: ANGLE_DOWN_DEG },
    { x: box.x + box.width, y: centerY, angle: ANGLE_RIGHT_DEG },
    { x: centerX + dx, y: centerY - dy, angle: ANGLE_UP_DEG },
  ];
  return sites.map((site, index) => ({ ...site, index }));
}

/**
 * The connection sites of a node drawn from its outline: the middles of its box's sides, then one
 * site where each connector meets it, so every connector is glued where it is drawn.
 *
 * @param box - The node's box.
 * @param ends - Where connectors start or end at the node.
 */
export function outlineSites(box: SceneRect, ends: readonly Point[]): ConnectionSite[] {
  const sites = sideSites(box).map((site, index) => ({ ...site, index }));
  for (const end of ends) {
    if (findSite(sites, end, SITE_TOLERANCE_PX / 2) !== null) {
      continue;
    }

    sites.push({ ...end, angle: outwardAngle(box, end), index: sites.length });
  }

  return sites;
}

/**
 * The site nearest a point, if it is within a distance.
 *
 * @param sites - The sites.
 * @param point - Where a connector ends.
 * @param tolerance - The largest distance in canvas pixels.
 */
export function findSite(
  sites: readonly ConnectionSite[],
  point: Point,
  tolerance = SITE_TOLERANCE_PX,
): ConnectionSite | null {
  let best: ConnectionSite | null = null;
  let bestDistance = tolerance;
  for (const site of sites) {
    const distance = Math.hypot(site.x - point.x, site.y - point.y);
    if (distance <= bestDistance) {
      best = site;
      bestDistance = distance;
    }
  }

  return best;
}

/**
 * Whether a point lies on a box's outline or just outside it, where a connector to it ends.
 *
 * @param box - The node's box.
 * @param point - The point.
 */
export function touchesBox(box: SceneRect, point: Point): boolean {
  const outsideX = Math.max(box.x - point.x, 0, point.x - (box.x + box.width));
  const outsideY = Math.max(box.y - point.y, 0, point.y - (box.y + box.height));
  if (outsideX > SITE_TOLERANCE_PX || outsideY > SITE_TOLERANCE_PX) {
    return false;
  }

  const insideX = Math.min(point.x - box.x, box.x + box.width - point.x);
  const insideY = Math.min(point.y - box.y, box.y + box.height - point.y);
  return Math.min(insideX, insideY) <= SITE_TOLERANCE_PX;
}

/**
 * The direction pointing out of the box from the side nearest a point.
 *
 * @param box - The box.
 * @param point - The point.
 */
function outwardAngle(box: SceneRect, point: Point): number {
  const distances: [number, number][] = [
    [ANGLE_UP_DEG, Math.abs(point.y - box.y)],
    [ANGLE_LEFT_DEG, Math.abs(point.x - box.x)],
    [ANGLE_DOWN_DEG, Math.abs(point.y - (box.y + box.height))],
    [ANGLE_RIGHT_DEG, Math.abs(point.x - (box.x + box.width))],
  ];
  distances.sort((a, b) => a[1] - b[1]);
  return distances[0]?.[0] ?? 0;
}
