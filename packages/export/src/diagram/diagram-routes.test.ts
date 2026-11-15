import { describe, expect, it } from 'vite-plus/test';

import type { Point } from '#vector/svg-path.ts';

import {
  connectorGeometry,
  connectorPathPoints,
  connectorPointOnSlide,
  simplifyRoute,
} from '#diagram/diagram-routes.ts';
import { findSite, outlineSites, presetSites, touchesBox } from '#diagram/diagram-sites.ts';

/**
 * The route a connector draws, on the slide.
 *
 * @param route - The route it was solved for.
 */
function drawn(route: readonly Point[]): Point[] {
  const geometry = connectorGeometry(route);
  if (geometry === null) {
    return [];
  }

  return connectorPathPoints(geometry).map((point) => connectorPointOnSlide(geometry, point));
}

/**
 * Expects two routes to match within a hundredth of a pixel.
 *
 * @param actual - The drawn route.
 * @param expected - The route asked for.
 */
function expectRoute(actual: readonly Point[], expected: readonly Point[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((point, index) => {
    expect(point.x).toBeCloseTo(expected[index]?.x ?? Number.NaN, 2);
    expect(point.y).toBeCloseTo(expected[index]?.y ?? Number.NaN, 2);
  });
}

describe('connectorGeometry', () => {
  it('draws two points as a straight connector, flipped towards the end', () => {
    const geometry = connectorGeometry([
      { x: 500, y: 300 },
      { x: 200, y: 300 },
    ]);
    expect(geometry).toMatchObject({
      preset: 'straightConnector1',
      flipH: true,
      flipV: false,
      box: { x: 200, y: 300, width: 300, height: 0 },
    });
  });

  it('draws a horizontal, vertical, horizontal route as bentConnector3 with its adjust value', () => {
    const route = [
      { x: 100, y: 100 },
      { x: 175, y: 100 },
      { x: 175, y: 300 },
      { x: 400, y: 300 },
    ];
    const geometry = connectorGeometry(route);
    expect(geometry).toMatchObject({ preset: 'bentConnector3', rotation: 0, adjust: [25_000] });
    expectRoute(drawn(route), route);
  });

  it('turns a connector a quarter for a route that leaves vertically', () => {
    const route = [
      { x: 748, y: 585 },
      { x: 748, y: 542 },
      { x: 1227, y: 542 },
      { x: 1227, y: 518 },
    ];
    const geometry = connectorGeometry(route);
    expect(geometry?.preset).toBe('bentConnector3');
    expect(geometry?.rotation).toBe(90);
    expectRoute(drawn(route), route);
  });

  it('solves every direction of a one-corner route', () => {
    const corners: Point[][] = [
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 80 },
      ],
      [
        { x: 100, y: 80 },
        { x: 100, y: 0 },
        { x: 0, y: 0 },
      ],
      [
        { x: 0, y: 80 },
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      [
        { x: 100, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 80 },
      ],
    ];
    for (const route of corners) {
      expect(connectorGeometry(route)?.preset).toBe('bentConnector2');
      expectRoute(drawn(route), route);
    }
  });

  it('draws three corners as bentConnector4 and four as bentConnector5', () => {
    const three = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 40 },
      { x: 200, y: 40 },
      { x: 200, y: 100 },
    ];
    const four = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 40 },
      { x: 150, y: 40 },
      { x: 150, y: 100 },
      { x: 200, y: 100 },
    ];
    expect(connectorGeometry(three)?.preset).toBe('bentConnector4');
    expectRoute(drawn(three), three);
    expect(connectorGeometry(four)?.preset).toBe('bentConnector5');
    expectRoute(drawn(four), four);
  });

  it('leaves a U-turn and a diagonal run with corners to a freeform', () => {
    expect(
      connectorGeometry([
        { x: 0, y: 0 },
        { x: 60, y: 0 },
        { x: 60, y: 40 },
        { x: 0, y: 40 },
      ]),
    ).toBeNull();
    expect(
      connectorGeometry([
        { x: 0, y: 0 },
        { x: 60, y: 30 },
        { x: 60, y: 90 },
      ]),
    ).toBeNull();
  });
});

describe('simplifyRoute', () => {
  it('drops repeated points and corners of straight runs', () => {
    expect(
      simplifyRoute([
        { x: 0, y: 0 },
        { x: 0, y: 0.2 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
    ]);
  });
});

describe('connection sites', () => {
  const box = { x: 100, y: 100, width: 200, height: 100 };

  it('lists a rectangle sites top, left, bottom, right', () => {
    expect(presetSites('roundRect', box).map((site) => [site.x, site.y])).toEqual([
      [200, 100],
      [100, 150],
      [200, 200],
      [300, 150],
    ]);
  });

  it('lists eight ellipse sites from the top anticlockwise', () => {
    const sites = presetSites('ellipse', box);
    expect(sites).toHaveLength(8);
    expect(sites[2]).toMatchObject({ x: 100, y: 150 });
    expect(sites[6]).toMatchObject({ x: 300, y: 150 });
  });

  it('finds a site a few pixels from where an arrow stops', () => {
    expect(findSite(presetSites('rect', box), { x: 97, y: 150 })?.index).toBe(1);
    expect(findSite(presetSites('rect', box), { x: 130, y: 150 })).toBeNull();
  });

  it('adds a site where a connector ends off the middle of a side', () => {
    const sites = outlineSites(box, [{ x: 232, y: 98 }]);
    expect(sites).toHaveLength(5);
    expect(sites[4]).toMatchObject({ x: 232, y: 98, angle: 270, index: 4 });
  });

  it('tells a route that ends on a node from one that ends beside it', () => {
    expect(touchesBox(box, { x: 303, y: 150 })).toBe(true);
    expect(touchesBox(box, { x: 200, y: 260 })).toBe(false);
    expect(touchesBox(box, { x: 200, y: 150 })).toBe(false);
  });
});
