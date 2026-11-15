import type { RawVectorShape } from '#scene/collected.ts';
import type { SceneRect, VectorShape } from '#scene/scene.ts';

import { maxOf, minOf } from '#units.ts';

/**
 * One absolute path command: move, line, cubic curve or close.
 */
export type PathCommand =
  | {
      /**
       * Starts a new subpath.
       */
      type: 'M';

      /**
       * The point.
       */
      points: [Point];
    }
  | {
      /**
       * A straight line.
       */
      type: 'L';

      /**
       * The end point.
       */
      points: [Point];
    }
  | {
      /**
       * A cubic Bézier curve.
       */
      type: 'C';

      /**
       * The two control points and the end point.
       */
      points: [Point, Point, Point];
    }
  | {
      /**
       * Closes the subpath.
       */
      type: 'Z';

      /**
       * No points.
       */
      points: [];
    };

/**
 * A point.
 */
export type Point = {
  /**
   * Horizontal position.
   */
  x: number;

  /**
   * Vertical position.
   */
  y: number;
};

/**
 * Matches a number at the scanner's position in SVG path data: a sign, digits with an optional
 * fraction (or a bare fraction) and an optional exponent. Sticky, so it reads from `lastIndex`.
 */
const PATH_NUMBER_PATTERN = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;

/**
 * Matches the whitespace and at most one comma that separate path data tokens.
 */
const PATH_SEPARATOR_PATTERN = /[\s,]*/y;

/**
 * Matches a command letter in SVG path data.
 */
const PATH_COMMAND_PATTERN = /[MmLlHhVvCcSsQqTtAaZz]/y;

/**
 * Matches a number in a `points` attribute.
 */
const NUMBER_PATTERN = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;

/**
 * The number of arguments each command letter takes.
 */
const ARGUMENT_COUNTS: Readonly<Record<string, number>> = {
  /**
   * Move: x y.
   */
  m: 2,

  /**
   * Line: x y.
   */
  l: 2,

  /**
   * Horizontal line: x.
   */
  h: 1,

  /**
   * Vertical line: y.
   */
  v: 1,

  /**
   * Cubic: x1 y1 x2 y2 x y.
   */
  c: 6,

  /**
   * Smooth cubic: x2 y2 x y.
   */
  s: 4,

  /**
   * Quadratic: x1 y1 x y.
   */
  q: 4,

  /**
   * Smooth quadratic: x y.
   */
  t: 2,

  /**
   * Arc: rx ry rotation large-arc sweep x y.
   */
  a: 7,

  /**
   * Close: nothing.
   */
  z: 0,
};

/**
 * The cubic control distance that approximates a quarter circle of radius 1.
 */
const KAPPA = 0.552_284_749_8;

/**
 * Decimal places kept in path output.
 */
const PATH_PRECISION = 2;

/**
 * Degrees in a half turn, which converts an arc's rotation from degrees to radians.
 */
const HALF_TURN_DEGREES = 180;

/**
 * Radians in a quarter turn: the largest sweep one cubic curve draws in an arc.
 */
const QUARTER_TURN_RADIANS = Math.PI / 2;

/**
 * The factor that places a cubic's control points from a quadratic's control point: two thirds.
 */
const QUADRATIC_TO_CUBIC = 2 / 3;

/**
 * How far a shape may miss the SVG's box and still count as filling it, in canvas pixels.
 */
const BOX_TOLERANCE_PX = 1;

/**
 * Parses SVG path data into absolute move, line, cubic and close commands. Relative commands,
 * horizontal and vertical lines, smooth curves, quadratic curves and elliptical arcs are
 * converted.
 *
 * @param data - The `d` attribute.
 * @returns The commands; parsing stops at the first malformed command, as browsers do.
 */
export function parsePathData(data: string): PathCommand[] {
  const commands: PathCommand[] = [];
  const state: PathState = {
    current: { x: 0, y: 0 },
    start: { x: 0, y: 0 },
    control: null,
  };
  const cursor = { position: 0 };
  let letter = '';
  for (;;) {
    skipSeparators(data, cursor);
    if (cursor.position >= data.length) {
      return commands;
    }

    const next = readMatch(PATH_COMMAND_PATTERN, data, cursor);
    if (next !== null) {
      letter = next;
    } else if (letter === '') {
      return commands;
    }

    const count = ARGUMENT_COUNTS[letter.toLowerCase()] ?? 0;
    const args = readArguments(data, cursor, letter.toLowerCase(), count);
    if (args === null) {
      return commands;
    }

    commands.push(...applyCommand(letter, args, state));
    if (letter === 'M') {
      letter = 'L';
    } else if (letter === 'm') {
      letter = 'l';
    } else if (count === 0) {
      letter = '';
    }
  }
}

/**
 * Reads the arguments of one command. Separators between numbers are optional (`10-5`, `.5.5`), and
 * an arc's two flags are single characters that need none (`a1 1 0 01 2 2`).
 *
 * @param data - The path data.
 * @param cursor - The scanner position; advanced past what was read.
 * @param letter - The lower-case command letter.
 * @param count - How many arguments the command takes.
 * @returns The arguments, or `null` when they are missing or malformed.
 */
function readArguments(
  data: string,
  cursor: { position: number },
  letter: string,
  count: number,
): number[] | null {
  const args: number[] = [];
  for (let index = 0; index < count; index += 1) {
    skipSeparators(data, cursor);
    const isFlag = letter === 'a' && (index === 3 || index === 4);
    const text = isFlag ? readFlag(data, cursor) : readMatch(PATH_NUMBER_PATTERN, data, cursor);
    if (text === null) {
      return null;
    }

    args.push(Number(text));
  }

  return args;
}

/**
 * Reads an arc flag, which is exactly `0` or `1`.
 *
 * @param data - The path data.
 * @param cursor - The scanner position.
 */
function readFlag(data: string, cursor: { position: number }): string | null {
  const flag = data[cursor.position];
  if (flag !== '0' && flag !== '1') {
    return null;
  }

  cursor.position += 1;
  return flag;
}

/**
 * Reads what a sticky pattern matches at the scanner position.
 *
 * @param pattern - A sticky pattern.
 * @param data - The path data.
 * @param cursor - The scanner position; advanced past the match.
 */
function readMatch(pattern: RegExp, data: string, cursor: { position: number }): string | null {
  pattern.lastIndex = cursor.position;
  const match = pattern.exec(data);
  if (match === null) {
    return null;
  }

  cursor.position = pattern.lastIndex;
  return match[0];
}

/**
 * Moves the scanner past whitespace and commas.
 *
 * @param data - The path data.
 * @param cursor - The scanner position.
 */
function skipSeparators(data: string, cursor: { position: number }): void {
  readMatch(PATH_SEPARATOR_PATTERN, data, cursor);
}

/**
 * The path of a drawable SVG element in its own units.
 *
 * @param shape - The element's tag and attributes.
 * @returns The commands; empty for an element without geometry.
 */
export function elementPath(shape: Pick<RawVectorShape, 'tag' | 'attrs'>): PathCommand[] {
  /**
   * A numeric attribute, 0 when it is missing.
   */
  const number = (name: string): number => Number.parseFloat(shape.attrs[name] ?? '0') || 0;
  switch (shape.tag) {
    case 'path': {
      return parsePathData(shape.attrs['d'] ?? '');
    }

    case 'line': {
      return [
        { type: 'M', points: [{ x: number('x1'), y: number('y1') }] },
        { type: 'L', points: [{ x: number('x2'), y: number('y2') }] },
      ];
    }

    case 'polyline':
    case 'polygon': {
      return pointsPath(shape.attrs['points'] ?? '', shape.tag === 'polygon');
    }

    case 'rect': {
      return rectPath(number('x'), number('y'), number('width'), number('height'), shape.attrs);
    }

    case 'circle': {
      return ellipsePath(number('cx'), number('cy'), number('r'), number('r'));
    }

    case 'ellipse': {
      return ellipsePath(number('cx'), number('cy'), number('rx'), number('ry'));
    }

    default: {
      return [];
    }
  }
}

/**
 * Converts a collected SVG element into a vector shape in canvas pixels.
 *
 * @param raw - The collected element.
 * @returns The shape, or `null` when it has no geometry.
 */
export function toVectorShape(raw: RawVectorShape): VectorShape | null {
  const commands = elementPath(raw);
  if (commands.length === 0) {
    return null;
  }

  const [a, b, c, d, e, f] = raw.matrix;
  /**
   * Maps a point through the shape's matrix.
   */
  const map = (point: Point): Point => ({
    x: a * point.x + c * point.y + e,
    y: b * point.x + d * point.y + f,
  });
  const mapped = commands.map((command) => ({
    ...command,
    points: command.points.map(map),
  })) as PathCommand[];
  return {
    path: formatPath(mapped),
    fill: raw.fill,
    stroke: raw.stroke,
    strokeWidth: raw.strokeWidth,
    cap: raw.cap === 'round' || raw.cap === 'square' ? raw.cap : 'butt',
    join: raw.join === 'round' || raw.join === 'bevel' ? raw.join : 'miter',
    evenOdd: raw.evenOdd,
  };
}

/**
 * The shapes of an SVG whose element has rounded corners (`border-radius` on the `<svg>`, which
 * clips what it draws), with that clip applied where geometry can: a rectangle that fills the SVG's
 * box, such as the plate behind a QR code, becomes a rectangle with the same corners. Other shapes
 * stay as they are; drawings rarely reach into the corners of their own box.
 *
 * @param shapes - The SVG's shapes in canvas pixels.
 * @param rect - The SVG's box.
 * @param radii - Its top-left, top-right, bottom-right and bottom-left radii.
 */
export function clipToRoundedBox(
  shapes: readonly VectorShape[],
  rect: SceneRect,
  radii: readonly [number, number, number, number],
): VectorShape[] {
  return shapes.map((shape) => {
    const commands = parsePathData(shape.path);
    const bounds = pathBounds(commands);
    const fillsBox =
      shape.stroke === null && bounds !== null && isRectangle(commands) && covers(bounds, rect);
    return fillsBox ? { ...shape, path: formatPath(roundedRectPath(rect, radii)) } : shape;
  });
}

/**
 * Whether commands draw one axis-aligned rectangle.
 *
 * @param commands - Absolute commands.
 */
function isRectangle(commands: readonly PathCommand[]): boolean {
  const types = commands.map((command) => command.type).join('');
  if (types !== 'MLLLZ' && types !== 'MLLLLZ') {
    return false;
  }

  const points = commands.flatMap((command) => command.points);
  const xs = new Set(points.map((point) => fixed(point.x)));
  const ys = new Set(points.map((point) => fixed(point.y)));
  return xs.size === 2 && ys.size === 2;
}

/**
 * Whether a shape's bounds cover a box, within {@link BOX_TOLERANCE_PX}.
 *
 * @param bounds - The shape's bounds.
 * @param rect - The box.
 */
function covers(bounds: SceneRect, rect: SceneRect): boolean {
  return (
    bounds.x <= rect.x + BOX_TOLERANCE_PX &&
    bounds.y <= rect.y + BOX_TOLERANCE_PX &&
    bounds.x + bounds.width >= rect.x + rect.width - BOX_TOLERANCE_PX &&
    bounds.y + bounds.height >= rect.y + rect.height - BOX_TOLERANCE_PX
  );
}

/**
 * The path of a box with four corner radii, clockwise from the top-left corner's end.
 *
 * @param rect - The box.
 * @param radii - Top-left, top-right, bottom-right and bottom-left radii.
 */
export function roundedRectPath(
  rect: SceneRect,
  radii: readonly [number, number, number, number],
): PathCommand[] {
  const limit = Math.min(rect.width, rect.height) / 2;
  const [topLeft, topRight, bottomRight, bottomLeft] = radii.map((radius) =>
    Math.max(0, Math.min(radius, limit)),
  ) as [number, number, number, number];
  const { x, y } = rect;
  const right = x + rect.width;
  const bottom = y + rect.height;
  /**
   * A quarter circle from one point to another around a corner, or nothing for a square corner.
   */
  const corner = (radius: number, from: Point, at: Point, to: Point): PathCommand[] =>
    radius === 0
      ? []
      : [
          {
            type: 'C',
            points: [
              {
                x: from.x + (at.x - from.x) * KAPPA,
                y: from.y + (at.y - from.y) * KAPPA,
              },
              { x: to.x + (at.x - to.x) * KAPPA, y: to.y + (at.y - to.y) * KAPPA },
              to,
            ],
          },
        ];
  return [
    { type: 'M', points: [{ x: x + topLeft, y }] },
    { type: 'L', points: [{ x: right - topRight, y }] },
    ...corner(topRight, { x: right - topRight, y }, { x: right, y }, { x: right, y: y + topRight }),
    { type: 'L', points: [{ x: right, y: bottom - bottomRight }] },
    ...corner(
      bottomRight,
      { x: right, y: bottom - bottomRight },
      { x: right, y: bottom },
      { x: right - bottomRight, y: bottom },
    ),
    { type: 'L', points: [{ x: x + bottomLeft, y: bottom }] },
    ...corner(
      bottomLeft,
      { x: x + bottomLeft, y: bottom },
      { x, y: bottom },
      { x, y: bottom - bottomLeft },
    ),
    { type: 'L', points: [{ x, y: y + topLeft }] },
    ...corner(topLeft, { x, y: y + topLeft }, { x, y }, { x: x + topLeft, y }),
    { type: 'Z', points: [] },
  ];
}

/**
 * Writes commands as path data with absolute commands only.
 *
 * @param commands - The commands.
 */
export function formatPath(commands: readonly PathCommand[]): string {
  return commands
    .map((command) =>
      [command.type, ...command.points.flatMap((point) => [fixed(point.x), fixed(point.y)])].join(
        ' ',
      ),
    )
    .join(' ');
}

/**
 * Reads path data written by {@link formatPath}.
 *
 * @param path - Absolute `M`, `L`, `C` and `Z` commands.
 */
export function readFormattedPath(path: string): PathCommand[] {
  return parsePathData(path);
}

/**
 * The bounding box of commands' points, control points included.
 *
 * @param commands - The commands.
 * @returns The box, or `null` for no points.
 */
export function pathBounds(
  commands: readonly PathCommand[],
): { x: number; y: number; width: number; height: number } | null {
  const points = commands.flatMap((command) => command.points);
  if (points.length === 0) {
    return null;
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = minOf(xs);
  const y = minOf(ys);
  return { x, y, width: maxOf(xs) - x, height: maxOf(ys) - y };
}

/**
 * A number with at most {@link PATH_PRECISION} decimals.
 *
 * @param value - The number.
 */
function fixed(value: number): number {
  return Number(value.toFixed(PATH_PRECISION));
}

/**
 * The parser's position.
 */
type PathState = {
  /**
   * The current point.
   */
  current: Point;

  /**
   * Where the subpath started.
   */
  start: Point;

  /**
   * The last control point, for smooth curves.
   */
  control: Point | null;
};

/**
 * Applies one command with its arguments, advancing the state.
 *
 * @param letter - The command letter; lowercase is relative.
 * @param args - Its numbers.
 * @param state - The parser's position.
 */
function applyCommand(letter: string, args: readonly number[], state: PathState): PathCommand[] {
  const relative = letter === letter.toLowerCase();
  const base = relative ? state.current : { x: 0, y: 0 };
  /**
   * The point at an argument index, made absolute.
   */
  const at = (xIndex: number): Point => ({
    x: (args[xIndex] ?? 0) + base.x,
    y: (args[xIndex + 1] ?? 0) + base.y,
  });
  switch (letter.toLowerCase()) {
    case 'm': {
      const point = at(0);
      state.current = point;
      state.start = point;
      state.control = null;
      return [{ type: 'M', points: [point] }];
    }

    case 'l':
    case 'h':
    case 'v': {
      const point = linePoint(letter, args, state.current, relative);
      state.current = point;
      state.control = null;
      return [{ type: 'L', points: [point] }];
    }

    case 'c':
    case 's': {
      return cubic(letter, state, at);
    }

    case 'q':
    case 't': {
      return quadratic(letter, state, at);
    }

    case 'a': {
      const end = at(5);
      const curves = arcToCubics(state.current, end, args);
      state.current = end;
      state.control = null;
      return curves;
    }

    default: {
      state.current = state.start;
      state.control = null;
      return [{ type: 'Z', points: [] }];
    }
  }
}

/**
 * The end point of a line command.
 *
 * @param letter - `l`, `h` or `v`, either case.
 * @param args - Its numbers.
 * @param current - The current point.
 * @param relative - Whether the command is relative.
 */
function linePoint(
  letter: string,
  args: readonly number[],
  current: Point,
  relative: boolean,
): Point {
  const [first = 0, second = 0] = args;
  switch (letter.toLowerCase()) {
    case 'h': {
      return { x: relative ? current.x + first : first, y: current.y };
    }

    case 'v': {
      return { x: current.x, y: relative ? current.y + first : first };
    }

    default: {
      return relative ? { x: current.x + first, y: current.y + second } : { x: first, y: second };
    }
  }
}

/**
 * A cubic or smooth cubic command.
 *
 * @param letter - `c` or `s`, either case.
 * @param state - The parser's position.
 * @param at - Reads a point from the arguments.
 */
function cubic(letter: string, state: PathState, at: (index: number) => Point): PathCommand[] {
  const isSmooth = letter.toLowerCase() === 's';
  const first = isSmooth ? reflect(state.control, state.current) : at(0);
  const second = isSmooth ? at(0) : at(2);
  const end = isSmooth ? at(2) : at(4);
  state.current = end;
  state.control = second;
  return [{ type: 'C', points: [first, second, end] }];
}

/**
 * A quadratic or smooth quadratic command, raised to a cubic.
 *
 * @param letter - `q` or `t`, either case.
 * @param state - The parser's position.
 * @param at - Reads a point from the arguments.
 */
function quadratic(letter: string, state: PathState, at: (index: number) => Point): PathCommand[] {
  const isSmooth = letter.toLowerCase() === 't';
  const control = isSmooth ? reflect(state.control, state.current) : at(0);
  const end = isSmooth ? at(0) : at(2);
  const start = state.current;
  state.current = end;
  state.control = control;
  return [
    {
      type: 'C',
      points: [
        {
          x: start.x + QUADRATIC_TO_CUBIC * (control.x - start.x),
          y: start.y + QUADRATIC_TO_CUBIC * (control.y - start.y),
        },
        {
          x: end.x + QUADRATIC_TO_CUBIC * (control.x - end.x),
          y: end.y + QUADRATIC_TO_CUBIC * (control.y - end.y),
        },
        end,
      ],
    },
  ];
}

/**
 * The reflection of the last control point about the current point, for smooth curves.
 *
 * @param control - The last control point, if the previous command was a curve.
 * @param current - The current point.
 */
function reflect(control: Point | null, current: Point): Point {
  if (control === null) {
    return current;
  }

  return { x: 2 * current.x - control.x, y: 2 * current.y - control.y };
}

/**
 * An elliptical arc in center form: where its center is, its radii, its rotation and the angles it
 * spans on the unrotated ellipse.
 */
type ArcCenter = {
  /**
   * Horizontal position of the center.
   */
  cx: number;

  /**
   * Vertical position of the center.
   */
  cy: number;

  /**
   * Horizontal radius, scaled up when the endpoints need a larger ellipse.
   */
  rx: number;

  /**
   * Vertical radius, scaled up when the endpoints need a larger ellipse.
   */
  ry: number;

  /**
   * Cosine of the rotation of the x axis.
   */
  cos: number;

  /**
   * Sine of the rotation of the x axis.
   */
  sin: number;

  /**
   * Angle of the start point on the unrotated ellipse, in radians.
   */
  startAngle: number;

  /**
   * Signed angle the arc sweeps, in radians, in the direction the sweep flag gives.
   */
  delta: number;
};

/**
 * Converts an arc's endpoints and radii to its center form (the endpoint-to-center conversion of
 * the SVG specification, appendix F.6.5).
 *
 * @param from - The arc's start.
 * @param to - The arc's end.
 * @param args - The arc's arguments: rx, ry, rotation, large-arc flag, sweep flag.
 */
function arcCenter(from: Point, to: Point, args: readonly number[]): ArcCenter {
  const [rxArg = 0, ryArg = 0, rotation = 0, largeArc = 0, sweep = 0] = args;
  const phi = (rotation * Math.PI) / HALF_TURN_DEGREES;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  let rx = Math.abs(rxArg);
  let ry = Math.abs(ryArg);
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }

  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const sign = largeArc === sweep ? -1 : 1;
  const factor = sign * Math.sqrt(Math.max(0, numerator / denominator));
  const cxPrime = (factor * rx * y1) / ry;
  const cyPrime = (-factor * ry * x1) / rx;
  const cx = cos * cxPrime - sin * cyPrime + (from.x + to.x) / 2;
  const cy = sin * cxPrime + cos * cyPrime + (from.y + to.y) / 2;
  const startAngle = Math.atan2((y1 - cyPrime) / ry, (x1 - cxPrime) / rx);
  let delta = Math.atan2((-y1 - cyPrime) / ry, (-x1 - cxPrime) / rx) - startAngle;
  if (sweep === 0 && delta > 0) {
    delta -= 2 * Math.PI;
  } else if (sweep !== 0 && delta < 0) {
    delta += 2 * Math.PI;
  }

  return { cx, cy, rx, ry, cos, sin, startAngle, delta };
}

/**
 * Converts an SVG elliptical arc to cubic curves, one curve per quarter turn or less.
 *
 * @param from - The arc's start.
 * @param to - The arc's end.
 * @param args - The arc's arguments: rx, ry, rotation, large-arc flag, sweep flag.
 */
function arcToCubics(from: Point, to: Point, args: readonly number[]): PathCommand[] {
  const [rxArg = 0, ryArg = 0] = args;
  const isCoincident = from.x === to.x && from.y === to.y;
  if (rxArg === 0 || ryArg === 0 || isCoincident) {
    return [{ type: 'L', points: [to] }];
  }

  const { cx, cy, rx, ry, cos, sin, startAngle, delta } = arcCenter(from, to, args);
  const segments = Math.ceil(Math.abs(delta) / QUARTER_TURN_RADIANS);
  const step = delta / segments;
  const handle = (4 / 3) * Math.tan(step / 4);
  /**
   * The point on the ellipse at an angle.
   */
  const point = (angle: number): Point => ({
    x: cx + rx * Math.cos(angle) * cos - ry * Math.sin(angle) * sin,
    y: cy + rx * Math.cos(angle) * sin + ry * Math.sin(angle) * cos,
  });
  /**
   * The tangent of the ellipse at an angle.
   */
  const derivative = (angle: number): Point => ({
    x: -rx * Math.sin(angle) * cos - ry * Math.cos(angle) * sin,
    y: -rx * Math.sin(angle) * sin + ry * Math.cos(angle) * cos,
  });
  return Array.from({ length: segments }, (_, index): PathCommand => {
    const a1 = startAngle + index * step;
    const a2 = a1 + step;
    const p1 = point(a1);
    const p2 = index === segments - 1 ? to : point(a2);
    const d1 = derivative(a1);
    const d2 = derivative(a2);
    return {
      type: 'C',
      points: [
        { x: p1.x + handle * d1.x, y: p1.y + handle * d1.y },
        { x: p2.x - handle * d2.x, y: p2.y - handle * d2.y },
        p2,
      ],
    };
  });
}

/**
 * The path of a `points` attribute.
 *
 * @param points - The attribute.
 * @param close - Whether to close it (a polygon).
 */
function pointsPath(points: string, close: boolean): PathCommand[] {
  const numbers = (points.match(NUMBER_PATTERN) ?? []).map(Number);
  const commands: PathCommand[] = [];
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    const point = { x: numbers[index] ?? 0, y: numbers[index + 1] ?? 0 };
    commands.push(index === 0 ? { type: 'M', points: [point] } : { type: 'L', points: [point] });
  }

  return close && commands.length > 0 ? [...commands, { type: 'Z', points: [] }] : commands;
}

/**
 * The path of a rectangle, with rounded corners when it has `rx` or `ry`.
 *
 * @param x - Left.
 * @param y - Top.
 * @param width - Width.
 * @param height - Height.
 * @param attrs - The element's attributes, for `rx` and `ry`.
 */
function rectPath(
  x: number,
  y: number,
  width: number,
  height: number,
  attrs: Readonly<Record<string, string>>,
): PathCommand[] {
  const rxValue = Number.parseFloat(attrs['rx'] ?? attrs['ry'] ?? '0') || 0;
  const ryValue = Number.parseFloat(attrs['ry'] ?? attrs['rx'] ?? '0') || 0;
  const rx = Math.min(rxValue, width / 2);
  const ry = Math.min(ryValue, height / 2);
  if (rx === 0 || ry === 0) {
    return [
      { type: 'M', points: [{ x, y }] },
      { type: 'L', points: [{ x: x + width, y }] },
      { type: 'L', points: [{ x: x + width, y: y + height }] },
      { type: 'L', points: [{ x, y: y + height }] },
      { type: 'Z', points: [] },
    ];
  }

  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  const right = x + width;
  const bottom = y + height;
  return [
    { type: 'M', points: [{ x: x + rx, y }] },
    { type: 'L', points: [{ x: right - rx, y }] },
    {
      type: 'C',
      points: [
        { x: right - rx + kx, y },
        { x: right, y: y + ry - ky },
        { x: right, y: y + ry },
      ],
    },
    { type: 'L', points: [{ x: right, y: bottom - ry }] },
    {
      type: 'C',
      points: [
        { x: right, y: bottom - ry + ky },
        { x: right - rx + kx, y: bottom },
        { x: right - rx, y: bottom },
      ],
    },
    { type: 'L', points: [{ x: x + rx, y: bottom }] },
    {
      type: 'C',
      points: [
        { x: x + rx - kx, y: bottom },
        { x, y: bottom - ry + ky },
        { x, y: bottom - ry },
      ],
    },
    { type: 'L', points: [{ x, y: y + ry }] },
    {
      type: 'C',
      points: [
        { x, y: y + ry - ky },
        { x: x + rx - kx, y },
        { x: x + rx, y },
      ],
    },
    { type: 'Z', points: [] },
  ];
}

/**
 * The path of an ellipse as four cubic curves.
 *
 * @param cx - Center x.
 * @param cy - Center y.
 * @param rx - Horizontal radius.
 * @param ry - Vertical radius.
 */
function ellipsePath(cx: number, cy: number, rx: number, ry: number): PathCommand[] {
  if (rx <= 0 || ry <= 0) {
    return [];
  }

  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [
    { type: 'M', points: [{ x: cx + rx, y: cy }] },
    {
      type: 'C',
      points: [
        { x: cx + rx, y: cy + ky },
        { x: cx + kx, y: cy + ry },
        { x: cx, y: cy + ry },
      ],
    },
    {
      type: 'C',
      points: [
        { x: cx - kx, y: cy + ry },
        { x: cx - rx, y: cy + ky },
        { x: cx - rx, y: cy },
      ],
    },
    {
      type: 'C',
      points: [
        { x: cx - rx, y: cy - ky },
        { x: cx - kx, y: cy - ry },
        { x: cx, y: cy - ry },
      ],
    },
    {
      type: 'C',
      points: [
        { x: cx + kx, y: cy - ry },
        { x: cx + rx, y: cy - ky },
        { x: cx + rx, y: cy },
      ],
    },
    { type: 'Z', points: [] },
  ];
}
