import type { ReactNode } from 'react';

import type { EdgeFrame } from '#diagrams/choreography.ts';
import type { ArrowStyle, LabelType } from '#diagrams/diagram-tokens.ts';
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
 * A dot arrowhead's radius as a share of the arrowhead's length.
 */
const DOT_SHARE = 0.32;

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
   * The brand's line width for edges.
   */
  stroke: number;

  /**
   * The brand's arrowhead: a filled triangle (the default), an open chevron or a dot.
   */
  arrow?: ArrowStyle;
};

/**
 * An edge in the diagram's SVG: its line (dashed for asynchronous links) and its arrowheads in the
 * brand's style (`data-arrow` on each head: a filled triangle, an open chevron stroked like the
 * line, or a filled dot), in the color its tone gives it.
 */
export function EdgePath({
  edge,
  path,
  frame,
  dimmed,
  stroke,
  arrow = 'triangle',
}: EdgePathProps): ReactNode {
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
        <path
          className="kit-flow-arrow"
          data-arrow={arrowData(arrow)}
          d={arrowHead(path.segments, 'end', stroke, arrow)}
        />
      ) : null}
      {arrowAtStart ? (
        <path
          className="kit-flow-arrow"
          data-arrow={arrowData(arrow)}
          d={arrowHead(path.segments, 'start', stroke, arrow)}
        />
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

  /**
   * Whether the brand sets edge labels in a bordered chip rather than on a plain knock-out.
   */
  chip?: boolean;

  /**
   * The type step the label is set in: the caption step (the default) or the brand's label step.
   */
  step?: LabelType;
};

/**
 * An edge's label in the HTML layer: a chip on the path, in the caption step, on the lines worked
 * out for it (two at most).
 */
export function EdgeLabel({
  edge,
  placed,
  frame,
  dimmed,
  lines,
  chip = false,
  step = 'caption',
}: EdgeLabelProps): ReactNode {
  if (edge.label === undefined) {
    return null;
  }

  return (
    <span
      className={`kit-flow-label kit-type-${step}`}
      data-diagram-part="edge-label"
      data-edge={edge.id}
      data-measure-label={edge.id}
      data-tone={frame.tone}
      data-label-style={chip ? 'chip' : undefined}
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
 * The `data-arrow` of an arrowhead: its style, or nothing for the default filled triangle.
 *
 * @param arrow - The arrowhead style.
 */
function arrowData(arrow: ArrowStyle): ArrowStyle | undefined {
  return arrow === 'triangle' ? undefined : arrow;
}

/**
 * The outline of an arrowhead at one end of a path, pointing along it, its tip on the path's end.
 *
 * @param segments - The path.
 * @param end - Which end.
 * @param stroke - The line width.
 * @param style - The arrowhead: a filled triangle (the default), an open chevron (two strokes
 *   meeting at the tip, drawn with the line's stroke), or a dot whose edge touches the tip.
 * @returns SVG path data: a closed triangle, an open polyline, or a circle.
 */
export function arrowHead(
  segments: readonly PathSegment[],
  end: 'start' | 'end',
  stroke: number,
  style: ArrowStyle = 'triangle',
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
  switch (style) {
    case 'triangle':
      return `M${format(tip)}L${format(left)}L${format(right)}Z`;
    case 'open': {
      // The stroke's round join reaches half a line width past the corner, so the corner sits that
      // far back and the drawn tip lands where a triangle's would.
      const back = { x: tip.x - (direction.x * stroke) / 2, y: tip.y - (direction.y * stroke) / 2 };
      const shift = { x: back.x - tip.x, y: back.y - tip.y };
      return (
        `M${format({ x: left.x + shift.x, y: left.y + shift.y })}L${format(back)}` +
        `L${format({ x: right.x + shift.x, y: right.y + shift.y })}`
      );
    }

    case 'dot': {
      const r = length * DOT_SHARE;
      const centre = { x: tip.x - direction.x * r, y: tip.y - direction.y * r };
      return (
        `M${format({ x: centre.x - r, y: centre.y })}` +
        `a${round2(r)} ${round2(r)} 0 1 0 ${round2(2 * r)} 0` +
        `a${round2(r)} ${round2(r)} 0 1 0 ${round2(-2 * r)} 0Z`
      );
    }
  }
}

/**
 * A point as path coordinates.
 *
 * @param point - The point.
 */
function format(point: Point): string {
  return `${round2(point.x)} ${round2(point.y)}`;
}
