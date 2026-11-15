import { LABEL_MAX_LINES, MIN_BREAK_CHARS } from '#diagrams/diagram-limits.ts';
import {
  distance,
  inflate,
  intersects,
  segmentCrossesRect,
  type Point,
  type Rect,
} from '#diagrams/geometry.ts';
import { pointAlong, type PathSegment } from '#diagrams/path-geometry.ts';
import { wordBreaks, wordPieces } from '#diagrams/word-breaks.ts';
import { maxOf, pushAll } from '#foundation/lists.ts';

/**
 * Splits a label into words on any run of whitespace.
 */
const WHITESPACE = /\s+/;

/**
 * What a label sitting across another edge's line costs: it is taken only when every other free
 * place is worse by more than this.
 */
const CROSSING_COST = 400;

/**
 * Room kept between a label and the nodes and labels around it, in pixels.
 */
const LABEL_CLEARANCE = 6;

/**
 * What sitting on the line costs against sitting beside it: labels go above horizontal runs and to
 * the right of vertical ones, where they never hide the line, its arrowhead or a packet, and take
 * the line only when there is no room beside it.
 */
const ON_LINE_COST = 60;

/**
 * How much of the line must show on each side of a label sitting on it, in pixels, so the edge
 * still reads as a line (and its arrowhead stays visible).
 */
const LINE_SHOWN = 22;

/**
 * Fractions along a segment where a label may sit, best first.
 */
const SEGMENT_FRACTIONS = [0.5, 0.38, 0.62, 0.26, 0.74];

/**
 * Fractions along a curved edge where a label may sit, best first.
 */
const CURVE_FRACTIONS = [0.5, 0.4, 0.6, 0.3, 0.7];

/**
 * The middle of an edge, as a fraction of its length.
 */
const EDGE_MIDDLE = 0.5;

/**
 * How far apart two corners' y values may be and still count as a horizontal run, in pixels.
 */
const HORIZONTAL_TOLERANCE_PX = 1;

/**
 * Cost added for each later fraction on a curve, so the middle of the curve wins.
 */
const CURVE_RANK_COST = 10;

/**
 * Cost added for each later fraction along a straight run, so the middle of the run wins.
 */
const RUN_RANK_COST = 8;

/**
 * Cost weight for a run being shorter than the edge's longest run: a run that falls short by the
 * whole of the longest run costs this much.
 */
const SHORTER_RUN_COST = 40;

/**
 * Cost weight for a run's middle being away from the middle of the whole edge.
 */
const OFF_MIDDLE_COST = 60;

/**
 * Cost of the second of the two sides beside a run, so the first side (above or to the right) wins
 * a tie.
 */
const OTHER_SIDE_COST = 10;

/**
 * Extra cost of a label beside a vertical run, so labels prefer the space above and below a
 * horizontal run.
 */
const VERTICAL_RUN_COST = 15;

/**
 * Extra cost of a label on a run too short to show the line on both sides of it.
 */
const TOO_SHORT_COST = 120;

/**
 * An edge label waiting for a place.
 */
export type LabelRequest = {
  /**
   * The edge id.
   */
  id: string;

  /**
   * The label's measured size.
   */
  width: number;

  /**
   * The label's measured height.
   */
  height: number;

  /**
   * The edge's corners, port to port.
   */
  points: readonly Point[];

  /**
   * The edge as drawn, for curves.
   */
  segments: readonly PathSegment[];
};

/**
 * Where a label went.
 */
export type PlacedLabel = {
  /**
   * The edge id.
   */
  id: string;

  /**
   * The label's box.
   */
  rect: Rect;

  /**
   * Whether no free place was found, so it overlaps a node, another label or the edge of the
   * diagram; `deck lint` reports it.
   */
  overlaps: boolean;
};

/**
 * How an edge label is set: its lines, and whether a word had to break inside or the text was cut.
 */
export type LabelLayout = {
  /**
   * The lines, one or two.
   */
  lines: string[];

  /**
   * Whether a word broke inside (at a camelCase or separator boundary).
   */
  broken: boolean;

  /**
   * Whether text was left out (an ellipsis stands for it).
   */
  truncated: boolean;
};

/**
 * A place a label could go, with how good it is.
 */
type Candidate = {
  /**
   * The label's box there.
   */
  rect: Rect;

  /**
   * Lower is better.
   */
  cost: number;
};

/**
 * A straight piece of an edge, and where its middle falls along the whole edge.
 */
type StraightRun = {
  /**
   * Its start.
   */
  from: Point;

  /**
   * Its end.
   */
  to: Point;

  /**
   * Its length.
   */
  length: number;

  /**
   * Where its middle falls along the edge, 0 to 1.
   */
  middle: number;
};

/**
 * Sets an edge label: on one line when it fits the widest a label gets; else words wrapped onto two
 * lines. A word wider than a line breaks only at a camelCase boundary or after `-`, `_`, `.` or `/`
 * ({@link wordBreaks}), never leaving fewer than three characters on a line. What still does not
 * fit is cut: a single identifier keeps its start and its end (`OrderCancelled…Event`), several
 * words end with an ellipsis after a whole word. The full text stays in the summary.
 *
 * @param text - The label.
 * @param measure - The width of a string in the caption step.
 * @param maxWidth - The widest a label line gets.
 */
export function labelLayout(
  text: string,
  measure: (text: string) => number,
  maxWidth: number,
): LabelLayout {
  const words = text.split(WHITESPACE).filter((word) => word !== '');
  /**
   * Whether a line fits.
   */
  const fits = (candidate: string): boolean => measure(candidate) <= maxWidth;
  const lines: string[] = [];
  let broken = false;
  let line = '';
  for (let index = 0; index < words.length; index += 1) {
    let word = words[index] ?? '';
    for (;;) {
      const candidate = appendTo(line, word);
      if (fits(candidate)) {
        line = candidate;
        break;
      }

      const last = lines.length === LABEL_MAX_LINES - 1;
      if (!last && line !== '' && fits(word)) {
        lines.push(line);
        line = '';
        continue;
      }

      const split = last ? undefined : breakToFit(line, word, fits);
      if (split !== undefined) {
        lines.push(split.line);
        line = '';
        word = split.rest;
        broken = true;
        continue;
      }

      if (!last && line !== '') {
        lines.push(line);
        line = '';
        continue;
      }

      const rest = [line, word, ...words.slice(index + 1)].filter((part) => part !== '').join(' ');
      const cut = fitEnd(rest, measure, maxWidth);
      return { lines: [...lines, cut], broken, truncated: cut !== rest };
    }
  }

  return { lines: line === '' ? lines : [...lines, line], broken, truncated: false };
}

/**
 * The lines an edge label sets ({@link labelLayout}).
 *
 * @param text - The label.
 * @param measure - The width of a string in the caption step.
 * @param maxWidth - The widest a label line gets.
 */
export function labelLines(
  text: string,
  measure: (text: string) => number,
  maxWidth: number,
): string[] {
  return labelLayout(text, measure, maxWidth).lines;
}

/**
 * How wide a label's text sets and on how many lines ({@link labelLayout}).
 *
 * @param text - The label.
 * @param measure - The width of a string in the caption step.
 * @param maxWidth - The widest a label line gets.
 * @returns The width of its widest line, its line count, and whether it was broken or cut.
 */
export function labelBox(
  text: string,
  measure: (text: string) => number,
  maxWidth: number,
): { width: number; lines: number; truncated: boolean; broken: boolean } {
  const layout = labelLayout(text, measure, maxWidth);
  return {
    width: maxOf(
      layout.lines.map((line) => measure(line)),
      0,
    ),
    lines: layout.lines.length,
    truncated: layout.truncated,
    broken: layout.broken,
  };
}

/**
 * Places every edge label along its path: above a horizontal run or to the right of a vertical one,
 * on the longest straight run near the middle of the edge; when there is no room beside the line it
 * sits on it, its background knocking the line out behind it. A place that overlaps a node, a label
 * placed before it, a group label or the diagram's edge is never taken while another is free; when
 * none is, the label takes the middle of the edge and is marked as overlapping. A place across
 * another edge's line is taken only when nothing better is free.
 *
 * @param requests - The labels, in the order they get first pick.
 * @param obstacles - Node boxes and group labels to keep clear of.
 * @param bounds - The diagram's box.
 * @param lines - Every edge's corners, which labels keep off when they can; the labelled edges by
 *   default.
 */
export function placeLabels(
  requests: readonly LabelRequest[],
  obstacles: readonly Rect[],
  bounds: Rect,
  lines: readonly Pick<LabelRequest, 'id' | 'points'>[] = requests,
): PlacedLabel[] {
  const placed: Rect[] = [];
  return requests.map((request) => {
    const others = lines.filter((other) => other.id !== request.id);
    /**
     * A place's cost plus what crossing other edges' lines adds.
     */
    const score = (candidate: Candidate): number =>
      candidate.cost + (crossesLines(candidate.rect, others) ? CROSSING_COST : 0);
    const candidates = candidatesFor(request);
    const free = candidates
      .filter((candidate) => isFree(candidate.rect, obstacles, placed, bounds))
      .sort((a, b) => score(a) - score(b))[0];
    const rect =
      free?.rect ?? leastCovering(candidates, [...obstacles, ...placed]) ?? fallbackRect(request);
    placed.push(rect);
    return { id: request.id, rect, overlaps: free === undefined };
  });
}

/**
 * Appends a part to a line, with a space between them unless the line is empty.
 *
 * @param line - The line so far.
 * @param part - The text to add.
 */
function appendTo(line: string, part: string): string {
  return line === '' ? part : `${line} ${part}`;
}

/**
 * A line ending in the longest start of a word, cut at one of its break points, that fits.
 *
 * @param line - The line so far.
 * @param word - The word that does not fit.
 * @param fits - Whether a line fits.
 * @returns The line and the rest of the word; `undefined` when no break point fits.
 */
function breakToFit(
  line: string,
  word: string,
  fits: (candidate: string) => boolean,
): { line: string; rest: string } | undefined {
  const point = [...wordBreaks(word)]
    .reverse()
    .find((at) => fits(appendTo(line, word.slice(0, at))));
  if (point === undefined) {
    return undefined;
  }

  return { line: appendTo(line, word.slice(0, point)), rest: word.slice(point) };
}

/**
 * The last line cut to fit: several words end with an ellipsis after the last whole word that fits
 * (or after the last break point of the first word that does); one identifier keeps its start and
 * its end around the ellipsis, cut at break points where it has them, with at least three
 * characters each side.
 *
 * @param line - The line.
 * @param measure - The width of a string.
 * @param maxWidth - The width to fit.
 */
function fitEnd(line: string, measure: (text: string) => number, maxWidth: number): string {
  if (measure(line) <= maxWidth) {
    return line;
  }

  const words = line.split(' ');
  if (words.length > 1) {
    return fitWords(line, words, measure, maxWidth);
  }

  return fitIdentifier(line, measure, maxWidth);
}

/**
 * Cuts a line of several words to fit, ending it with an ellipsis after the last whole word that
 * fits, or else after the last break point of its first word.
 *
 * @param line - The line.
 * @param words - The line's words, split on single spaces.
 * @param measure - The width of a string.
 * @param maxWidth - The width to fit.
 */
function fitWords(
  line: string,
  words: readonly string[],
  measure: (text: string) => number,
  maxWidth: number,
): string {
  /**
   * Whether a line fits.
   */
  const fits = (candidate: string): boolean => measure(candidate) <= maxWidth;
  for (let count = words.length - 1; count >= 1; count -= 1) {
    const head = words.slice(0, count).join(' ');
    if (fits(`${head}…`)) {
      return `${head}…`;
    }
  }

  const first = words[0] ?? line;
  const pieces = wordPieces(first);
  for (let count = pieces.length - 1; count >= 1; count -= 1) {
    const head = pieces.slice(0, count).join('');
    if (fits(`${head}…`)) {
      return `${head}…`;
    }
  }

  return fitEnd(`${first}…`, measure, maxWidth);
}

/**
 * Cuts one identifier to fit, keeping its start and its end around the ellipsis. The end is its
 * last piece (or its last few characters when it has no break points), and the start is the longest
 * run of leading pieces that fits. When no start fits, the identifier is cut back one character at
 * a time, keeping at least {@link MIN_BREAK_CHARS} before the ellipsis.
 *
 * @param identifier - The identifier.
 * @param measure - The width of a string.
 * @param maxWidth - The width to fit.
 */
function fitIdentifier(
  identifier: string,
  measure: (text: string) => number,
  maxWidth: number,
): string {
  /**
   * Whether a line fits.
   */
  const fits = (candidate: string): boolean => measure(candidate) <= maxWidth;
  const pieces = wordPieces(identifier);
  const tail =
    pieces.length > 1 ? (pieces[pieces.length - 1] ?? '') : identifier.slice(-MIN_BREAK_CHARS * 2);
  const starts =
    pieces.length > 1
      ? pieces.slice(0, -1).map((_, index) => pieces.slice(0, index + 1).join(''))
      : [];
  const head = [...starts].reverse().find((start) => fits(`${start}…${tail}`));
  if (head !== undefined) {
    return `${head}…${tail}`;
  }

  let length = identifier.length - tail.length - 1;
  while (length > MIN_BREAK_CHARS && !fits(`${identifier.slice(0, length)}…${tail}`)) {
    length -= 1;
  }

  const cut = `${identifier.slice(0, Math.max(length, MIN_BREAK_CHARS))}…${tail}`;
  return fits(cut) ? cut : `${identifier.slice(0, MIN_BREAK_CHARS)}…`;
}

/**
 * The straight pieces between an edge's corners.
 *
 * @param points - The corners.
 */
function straightRuns(points: readonly Point[]): StraightRun[] {
  const lengths = points.slice(1).map((point, index) => distance(points[index] as Point, point));
  const total = lengths.reduce((sum, length) => sum + length, 0) || 1;
  let travelled = 0;
  return lengths.map((length, index) => {
    const run = {
      from: points[index] as Point,
      to: points[index + 1] as Point,
      length,
      middle: (travelled + length / 2) / total,
    };
    travelled += length;
    return run;
  });
}

/**
 * The places a label could go along its edge, scored.
 *
 * @param request - The label.
 */
function candidatesFor(request: LabelRequest): Candidate[] {
  const first = request.segments[0];
  if (request.points.length === 2 && first?.kind === 'cubic') {
    return CURVE_FRACTIONS.map((fraction, rank) => ({
      rect: centredAt(pointAlong(request.segments, fraction), request),
      cost: rank * CURVE_RANK_COST,
    }));
  }

  const runs = straightRuns(request.points);
  const longest = maxOf(
    runs.map((run) => run.length),
    1,
  );
  const candidates: Candidate[] = [];
  for (const run of runs) {
    pushAll(candidates, candidatesOnRun(run, longest, request));
  }

  return candidates;
}

/**
 * The places a label could go along one straight run: beside it at each fraction, and on it when
 * the run is too short for the label to sit beside it.
 *
 * @param run - The straight run.
 * @param longest - The length of the edge's longest run.
 * @param request - The label.
 */
function candidatesOnRun(run: StraightRun, longest: number, request: LabelRequest): Candidate[] {
  const horizontal = Math.abs(run.from.y - run.to.y) < HORIZONTAL_TOLERANCE_PX;
  const room = horizontal ? request.width : request.height;
  const roomOnLine = run.length >= room + 2 * LINE_SHOWN;
  const runCost =
    (1 - run.length / longest) * SHORTER_RUN_COST +
    Math.abs(run.middle - EDGE_MIDDLE) * OFF_MIDDLE_COST;
  const candidates: Candidate[] = [];
  SEGMENT_FRACTIONS.forEach((fraction, rank) => {
    const at = lerp(run.from, run.to, fraction);
    const rankCost = runCost + rank * RUN_RANK_COST;
    besideOffsets(horizontal, request).forEach((offset, side) => {
      candidates.push({
        rect: centredAt({ x: at.x + offset.x, y: at.y + offset.y }, request),
        cost: rankCost + side * OTHER_SIDE_COST + (horizontal ? 0 : VERTICAL_RUN_COST),
      });
    });
    candidates.push({
      rect: centredAt(at, request),
      cost: rankCost + ON_LINE_COST + (roomOnLine ? 0 : TOO_SHORT_COST),
    });
  });

  return candidates;
}

/**
 * Offsets that put a label beside a run instead of on it: above and below a horizontal run, left
 * and right of a vertical one.
 *
 * @param horizontal - Whether the run is horizontal.
 * @param size - The label's size.
 */
function besideOffsets(horizontal: boolean, size: { width: number; height: number }): Point[] {
  if (horizontal) {
    const dy = size.height / 2 + LABEL_CLEARANCE;
    return [
      { x: 0, y: -dy },
      { x: 0, y: dy },
    ];
  }

  const dx = size.width / 2 + LABEL_CLEARANCE;
  return [
    { x: dx, y: 0 },
    { x: -dx, y: 0 },
  ];
}

/**
 * Whether a label box is clear of nodes, earlier labels and the diagram's edge.
 *
 * @param rect - The box.
 * @param obstacles - Nodes and group labels.
 * @param placed - Labels placed already.
 * @param bounds - The diagram's box.
 */
function isFree(
  rect: Rect,
  obstacles: readonly Rect[],
  placed: readonly Rect[],
  bounds: Rect,
): boolean {
  const padded = inflate(rect, LABEL_CLEARANCE);
  const inside =
    rect.x >= bounds.x &&
    rect.y >= bounds.y &&
    rect.x + rect.width <= bounds.x + bounds.width &&
    rect.y + rect.height <= bounds.y + bounds.height;
  return (
    inside &&
    !obstacles.some((obstacle) => intersects(padded, obstacle)) &&
    !placed.some((other) => intersects(padded, other))
  );
}

/**
 * The place that covers the least of the nodes and labels around it, for a label with nowhere free
 * to go.
 *
 * @param candidates - The places a label could go.
 * @param obstacles - Nodes, group labels and labels placed already.
 */
function leastCovering(
  candidates: readonly Candidate[],
  obstacles: readonly Rect[],
): Rect | undefined {
  /**
   * How much of the obstacles a box covers, in square pixels.
   */
  const covered = (rect: Rect): number =>
    obstacles.reduce((sum, obstacle) => {
      const width =
        Math.min(rect.x + rect.width, obstacle.x + obstacle.width) - Math.max(rect.x, obstacle.x);
      const height =
        Math.min(rect.y + rect.height, obstacle.y + obstacle.height) - Math.max(rect.y, obstacle.y);
      return sum + Math.max(width, 0) * Math.max(height, 0);
    }, 0);
  const ranked = [...candidates].sort(
    (a, b) => covered(a.rect) - covered(b.rect) || a.cost - b.cost,
  );
  return ranked[0]?.rect;
}

/**
 * The middle of the edge, for a label with nowhere free to go.
 *
 * @param request - The label.
 */
function fallbackRect(request: LabelRequest): Rect {
  return centredAt(pointAlong(request.segments, EDGE_MIDDLE), request);
}

/**
 * A label box centred on a point.
 *
 * @param point - The centre.
 * @param size - The label's size.
 */
function centredAt(point: Point, size: { width: number; height: number }): Rect {
  return {
    x: point.x - size.width / 2,
    y: point.y - size.height / 2,
    width: size.width,
    height: size.height,
  };
}

/**
 * The point a fraction of the way from one point to another.
 *
 * @param a - Start.
 * @param b - End.
 * @param t - The fraction.
 */
function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Whether a box sits across any run of some edges.
 *
 * @param rect - The box.
 * @param edges - The edges.
 */
function crossesLines(rect: Rect, edges: readonly Pick<LabelRequest, 'points'>[]): boolean {
  return edges.some((edge) =>
    edge.points
      .slice(1)
      .some((point, index) => segmentCrossesRect(edge.points[index] as Point, point, rect)),
  );
}
