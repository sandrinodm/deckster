import { describe, expect, it } from 'vite-plus/test';

import {
  clipToRoundedBox,
  elementPath,
  formatPath,
  parsePathData,
  pathBounds,
  roundedRectPath,
  toVectorShape,
} from '#vector/svg-path.ts';

describe('parsePathData', () => {
  it('turns relative, horizontal and vertical commands into absolute lines', () => {
    expect(formatPath(parsePathData('M10 10 h20 v10 l-5 5 H0 V0 z'))).toBe(
      'M 10 10 L 30 10 L 30 20 L 25 25 L 0 25 L 0 0 Z',
    );
  });

  it('raises quadratic curves to cubics and reflects smooth curves', () => {
    const [, quadratic] = parsePathData('M0 0 Q 30 30 60 0');
    expect(quadratic).toEqual({
      type: 'C',
      points: [
        { x: 20, y: 20 },
        { x: 40, y: 20 },
        { x: 60, y: 0 },
      ],
    });
    const smooth = parsePathData('M0 0 C 0 10 10 10 10 0 S 20 -10 20 0');
    expect(smooth[2]?.points[0]).toEqual({ x: 10, y: -10 });
  });

  it('converts an arc to cubic curves that end on the arc end point', () => {
    const commands = parsePathData('M 0 10 A 10 10 0 0 1 20 10');
    expect(commands.slice(1).every((command) => command.type === 'C')).toBe(true);
    expect(commands.at(-1)?.points.at(-1)).toEqual({ x: 20, y: 10 });
    const bounds = pathBounds(commands);
    expect(bounds?.y).toBeCloseTo(-0.0, 0);
  });

  it('keeps implicit line-tos after a move and stops at malformed data', () => {
    expect(formatPath(parsePathData('m 1 1 2 2 3 3'))).toBe('M 1 1 L 3 3 L 6 6');
    expect(parsePathData('M 1 1 L 2')).toHaveLength(1);
  });
});

describe('element paths', () => {
  it('draws rectangles, rounded rectangles, circles and polygons', () => {
    expect(
      formatPath(elementPath({ tag: 'rect', attrs: { x: '1', y: '2', width: '3', height: '4' } })),
    ).toBe('M 1 2 L 4 2 L 4 6 L 1 6 Z');
    expect(
      elementPath({ tag: 'rect', attrs: { width: '10', height: '10', rx: '2' } }).filter(
        (command) => command.type === 'C',
      ),
    ).toHaveLength(4);
    expect(pathBounds(elementPath({ tag: 'circle', attrs: { cx: '5', cy: '5', r: '5' } }))).toEqual(
      { x: 0, y: 0, width: 10, height: 10 },
    );
    expect(formatPath(elementPath({ tag: 'polygon', attrs: { points: '5,1 9.5,9 0.5,9' } }))).toBe(
      'M 5 1 L 9.5 9 L 0.5 9 Z',
    );
  });

  it('maps a shape into canvas pixels through its matrix', () => {
    const shape = toVectorShape({
      tag: 'line',
      attrs: { x1: '0', y1: '0', x2: '10', y2: '0' },
      matrix: [2, 0, 0, 2, 100, 50],
      fill: null,
      stroke: '#2d4ae0',
      strokeWidth: 3.5,
      cap: 'round',
      join: 'round',
      evenOdd: false,
    });
    expect(shape).toMatchObject({
      path: 'M 100 50 L 120 50',
      stroke: '#2d4ae0',
      cap: 'round',
      join: 'round',
    });
  });
});

describe('clipToRoundedBox', () => {
  /**
   * A filled shape with the given path.
   */
  const filled = (path: string, fill = '#ffffff') => ({
    path,
    fill,
    stroke: null,
    strokeWidth: 0,
    cap: 'butt' as const,
    join: 'miter' as const,
    evenOdd: false,
  });
  const box = { x: 100, y: 50, width: 300, height: 300 };

  it('rounds the plate that fills a rounded SVG and leaves the drawing on it alone', () => {
    const plate = filled('M 100 50 L 400 50 L 400 350 L 100 350 Z');
    const modules = filled('M 130 80 L 140 80 L 140 90 L 130 90 Z', '#2d4ae0');
    const [rounded, inner] = clipToRoundedBox([plate, modules], box, [12, 12, 12, 12]);
    expect(rounded?.path).toBe(formatPath(roundedRectPath(box, [12, 12, 12, 12])));
    expect(rounded?.path.match(/C/g)).toHaveLength(4);
    expect(pathBounds(parsePathData(rounded?.path ?? ''))).toEqual(box);
    expect(inner).toEqual(modules);
  });

  it('keeps a stroked or smaller rectangle and square corners as they are', () => {
    const stroked = { ...filled('M 100 50 L 400 50 L 400 350 L 100 350 Z'), stroke: '#000000' };
    const smaller = filled('M 110 60 L 390 60 L 390 340 L 110 340 Z');
    expect(clipToRoundedBox([stroked, smaller], box, [12, 12, 12, 12])).toEqual([stroked, smaller]);
    expect(formatPath(roundedRectPath(box, [0, 20, 0, 0]))).toBe(
      'M 100 50 L 380 50 C 391.05 50 400 58.95 400 70 L 400 350 L 100 350 L 100 50 Z',
    );
  });
});

describe('parsePathData tokenising', () => {
  /**
   * Path data with the absolute path it must produce, after the SVG path grammar.
   */
  const cases: readonly (readonly [string, string, string])[] = [
    ['exponent number as an implicit lineto', 'M0 0 1e2 0 200 0', 'M 0 0 L 100 0 L 200 0'],
    ['signed exponent', 'M0 0 L1E+1 2e-1', 'M 0 0 L 10 0.2'],
    ['sign as a separator', 'M10-5L-5-10', 'M 10 -5 L -5 -10'],
    ['decimals without separators', 'M.5.5L1.5.5', 'M 0.5 0.5 L 1.5 0.5'],
    ['repeated lineto', 'M0 0L10 0 10 10 0 10z', 'M 0 0 L 10 0 L 10 10 L 0 10 Z'],
    ['implicit lineto after relative moveto', 'm1 1 2 2 3 3', 'M 1 1 L 3 3 L 6 6'],
    ['commas and no spaces', 'M0,0L1,1,2,2', 'M 0 0 L 1 1 L 2 2'],
    ['the spec triangle', 'M 100 100 L 300 100 L 200 300 z', 'M 100 100 L 300 100 L 200 300 Z'],
  ];
  it.each(cases)('reads %s', (_name, data, expected) => {
    expect(formatPath(parsePathData(data))).toBe(expected);
  });

  it('reads arc flags written without separators like spaced ones', () => {
    const spaced = parsePathData('M0 0 a1 1 0 0 1 2 2');
    expect(parsePathData('M0 0 a1 1 0 01 2 2')).toEqual(spaced);
    expect(parsePathData('M0 0a1 1 0 012 2')).toEqual(spaced);
    expect(spaced.at(-1)?.points.at(-1)).toEqual({ x: 2, y: 2 });
  });

  it('repeats an arc without repeating its letter', () => {
    const commands = parsePathData('M0 0 a1 1 0 01 2 2 1 1 0 01 2 2');
    expect(commands.at(-1)?.points.at(-1)).toEqual({ x: 4, y: 4 });
  });

  it('stops at a malformed command and keeps what came before', () => {
    expect(formatPath(parsePathData('M0 0 L10 10 L5'))).toBe('M 0 0 L 10 10');
    expect(parsePathData('10 10')).toEqual([]);
    expect(parsePathData('M0 0 a1 1 0 2 1 2 2')).toHaveLength(1);
  });
});
