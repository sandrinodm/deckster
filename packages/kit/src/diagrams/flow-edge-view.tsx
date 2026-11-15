import type { ReactNode } from 'react';

import type { EdgeFrame } from '#diagrams/choreography.ts';
import type { PlacedLabel } from '#diagrams/flow-labels.ts';
import type { RoutedEdge } from '#diagrams/flow-route.ts';
import type { FlowEdgeSpec } from '#diagrams/flow-spec.ts';

import { flag, presence } from '#diagrams/data-flags.ts';
import { round2, type Point } from '#diagrams/geometry.ts';
import { pathData, pointAlong, type PathSegment } from '#diagrams/path-geometry.ts';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';

/**
 * An arrowhead's length as a multiple of the edge's line width, and its least length in pixels.
 */
const ARROW_LENGTH = {
  /**
   * Pixels of length per pixel of line width.
   */
  perStroke: 5,

  /**
   * The least length in pixels.
   */
  minimum: 10,
} as const;

/**
 * An arrowhead's half-width as a share of its length.
 */
const ARROW_SPREAD = 0.42;

/**
 * Where along a path the arrowhead's tip reads its direction from, just inside the path's end.
 */
const ARROW_NEAR_END = 0.999;

/**
 * Where along a path the arrowhead's tip reads its direction from, just inside the path's start.
 */
const ARROW_NEAR_START = 0.001;

/**
 * Props of {@link EdgePath}.
 */
type EdgePathProps = {
  /**
   * The edge.
   */
  edge: FlowEdgeSpec;

  /**
   * Its route.
   */
  path: RoutedEdge;

  /**
   * What the step shows.
   */
  frame: EdgeFrame;

  /**
   * Whether a focus dims it.
   */
  dimmed: boolean;

  /**
   * The brand's regular line width.
   */
  stroke: number;
};

/**
 * An edge in the diagram's SVG: its line (dashed for asynchronous links) and its arrowheads, in the
 * color its tone gives it.
 */
export function EdgePath({ edge, path, frame, dimmed, stroke }: EdgePathProps): ReactNode {
  const arrowAtEnd = edge.arrow === 'end' || edge.arrow === 'both';
  const arrowAtStart = edge.arrow === 'start' || edge.arrow === 'both';
  return (
    <g
      className="kit-flow-edge"
      data-diagram-part="edge"
      data-edge={edge.id}
      data-edge-from={edge.from}
      data-edge-to={edge.to}
      data-edge-label={edge.label}
      data-tone={frame.tone}
      data-dashed={flag(edge.dashed)}
      data-dimmed={flag(dimmed)}
      data-decorative={presence(dimmed)}
      data-visible={String(frame.visible)}>
      <path className="kit-flow-edge-line" d={pathData(path.segments)} />
      {arrowAtEnd ? (
        <path className="kit-flow-arrow" d={arrowHead(path.segments, 'end', stroke)} />
      ) : null}
      {arrowAtStart ? (
        <path className="kit-flow-arrow" d={arrowHead(path.segments, 'start', stroke)} />
      ) : null}
    </g>
  );
}

/**
 * Props of {@link EdgeLabel}.
 */
type EdgeLabelProps = {
  /**
   * The edge.
   */
  edge: FlowEdgeSpec;

  /**
   * Where its label went; `undefined` before the first measurement.
   */
  placed: PlacedLabel | undefined;

  /**
   * What the step shows.
   */
  frame: EdgeFrame;

  /**
   * Whether a focus dims it.
   */
  dimmed: boolean;

  /**
   * The lines it sets, when it wraps or is cut; the whole label on one line without them.
   */
  lines?: readonly string[] | undefined;
};

/**
 * An edge's label in the HTML layer: a chip on the path, in the caption step, on the lines worked
 * out for it (two at most).
 */
export function EdgeLabel({ edge, placed, frame, dimmed, lines }: EdgeLabelProps): ReactNode {
  if (edge.label === undefined) {
    return null;
  }

  return (
    <span
      className="kit-flow-label kit-type-caption"
      data-diagram-part="edge-label"
      data-edge={edge.id}
      data-measure-label={edge.id}
      data-tone={frame.tone}
      data-label-overlap={placed?.overlaps === true ? 'true' : undefined}
      data-dimmed={flag(dimmed)}
      data-decorative={presence(dimmed)}
      data-visible={String(frame.visible)}
      title={lines !== undefined && lines.join(' ') !== edge.label ? edge.label : undefined}
      style={placed === undefined ? undefined : { left: placed.rect.x, top: placed.rect.y }}>
      {lines === undefined || lines.length <= 1
        ? smartPunctuation(lines?.[0] ?? edge.label)
        : lines.map((line, index) => (
            <span key={index} className="kit-flow-label-line">
              {index === 0 ? '' : ' '}
              {smartPunctuation(line)}
            </span>
          ))}
    </span>
  );
}

/**
 * The outline of an arrowhead at one end of a path, pointing along it.
 *
 * @param segments - The path.
 * @param end - Which end.
 * @param stroke - The line width.
 * @returns SVG path data for a filled triangle.
 */
export function arrowHead(
  segments: readonly PathSegment[],
  end: 'start' | 'end',
  stroke: number,
): string {
  const length = Math.max(ARROW_LENGTH.minimum, stroke * ARROW_LENGTH.perStroke);
  const tip = pointAlong(segments, end === 'end' ? 1 : 0);
  const near = pointAlong(segments, end === 'end' ? ARROW_NEAR_END : ARROW_NEAR_START);
  // The head points from the sampled point just inside the path towards its tip, and its base sits
  // one arrow length back along that direction, with the two corners spread to either side.
  const angle = Math.atan2(tip.y - near.y, tip.x - near.x);
  const direction = { x: Math.cos(angle), y: Math.sin(angle) };
  const base = { x: tip.x - direction.x * length, y: tip.y - direction.y * length };
  const spread = length * ARROW_SPREAD;
  const left = { x: base.x - direction.y * spread, y: base.y + direction.x * spread };
  const right = { x: base.x + direction.y * spread, y: base.y - direction.x * spread };
  return `M${format(tip)}L${format(left)}L${format(right)}Z`;
}

/**
 * A point as path coordinates.
 *
 * @param point - The point.
 */
function format(point: Point): string {
  return `${round2(point.x)} ${round2(point.y)}`;
}
