import { Fragment, type CSSProperties, type ReactNode } from 'react';

import type { BadgeCorner } from '#diagrams/badge-placement.ts';
import type { NodeFrame } from '#diagrams/choreography.ts';
import type { NodeExtras } from '#diagrams/flow-children.ts';
import type { FlowNodeSpec } from '#diagrams/flow-spec.ts';
import type { Rect } from '#diagrams/geometry.ts';
import type { ShapeGeometry } from '#diagrams/node-shapes.ts';

import { BADGE_ON_EDGE_MIN_WIDTH } from '#diagrams/badge-placement.ts';
import { flag, presence } from '#diagrams/data-flags.ts';
import { NODE_KINDS } from '#diagrams/node-kinds.ts';
import { hyphenPoints, wordPieces } from '#diagrams/word-breaks.ts';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';

/**
 * The soft hyphen: invisible unless the line breaks at it.
 */
const SOFT_HYPHEN = '\u00ad';

/**
 * Splits text at its whitespace, keeping the whitespace as its own parts.
 */
const WHITESPACE_PARTS = /(\s+)/;

/**
 * Whether a part is whitespace.
 */
const WHITESPACE = /\s/;

/**
 * Props of {@link NodeShape}.
 */
type NodeShapeProps = {
  /**
   * The node.
   */
  node: FlowNodeSpec;

  /**
   * Its geometry.
   */
  geometry: ShapeGeometry;

  /**
   * What the step shows.
   */
  frame: NodeFrame;

  /**
   * Whether a focus dims it.
   */
  dimmed: boolean;

  /**
   * When the packet lands, in milliseconds, so the node lights up then; 0 in static mode.
   */
  arrivalDelay: number;
};

/**
 * A node's drawn shape, in the diagram's SVG: the back layer of stacked shapes, the halo that shows
 * emphasis, the outline and the detail lines, plus the ring that pulses when a packet lands.
 */
export function NodeShape({
  node,
  geometry,
  frame,
  dimmed,
  arrivalDelay,
}: NodeShapeProps): ReactNode {
  return (
    <g
      className="kit-flow-shape"
      style={{ '--kit-arrival-delay': `${Math.round(arrivalDelay)}ms` } as CSSProperties}
      data-diagram-part="node-shape"
      data-node={node.id}
      data-grouped={flag(node.group !== undefined)}
      data-state={frame.state}
      data-arrival={flag(frame.arrival)}
      data-dimmed={flag(dimmed)}
      data-visible={String(frame.visible)}
      data-dashed={flag(geometry.dashed)}>
      <path className="kit-flow-halo" d={geometry.outline} />
      {geometry.under === '' ? null : <path className="kit-flow-under" d={geometry.under} />}
      <path className="kit-flow-outline" d={geometry.outline} />
      {geometry.details === '' ? null : <path className="kit-flow-details" d={geometry.details} />}
      <path className="kit-flow-pulse" data-motion={`pulse:${node.id}`} d={geometry.outline} />
    </g>
  );
}

/**
 * Props of {@link NodeBody}.
 */
type NodeBodyProps = {
  /**
   * The node.
   */
  node: FlowNodeSpec;

  /**
   * Its icon and own content.
   */
  extras: NodeExtras | undefined;

  /**
   * Its box.
   */
  rect: Rect;

  /**
   * Room its shape takes at each side.
   */
  inset: ShapeGeometry['inset'];

  /**
   * What the step shows.
   */
  frame: NodeFrame;

  /**
   * Whether a focus dims it.
   */
  dimmed: boolean;

  /**
   * When the packet lands, in milliseconds, so the node lights up then; 0 in static mode.
   */
  arrivalDelay: number;
};

/**
 * A node's text, icon and badge, in the diagram's HTML layer over its shape, set in the brand's
 * type steps so they never scale below the brand's sizes.
 */
export function NodeBody({
  node,
  extras,
  rect,
  inset,
  frame,
  dimmed,
  arrivalDelay,
}: NodeBodyProps): ReactNode {
  const Icon = extras?.icon;
  const shape = NODE_KINDS[node.kind].shape;
  const style = {
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
    '--kit-arrival-delay': `${Math.round(arrivalDelay)}ms`,
  } as CSSProperties;
  return (
    <div
      className="kit-flow-node"
      style={style}
      data-diagram-part="node"
      data-node={node.id}
      data-node-title={node.title}
      data-kind={node.kind}
      data-shape={shape}
      data-state={frame.state}
      data-arrival={flag(frame.arrival)}
      data-dimmed={flag(dimmed)}
      data-decorative={presence(dimmed || frame.state === 'muted')}
      data-visible={String(frame.visible)}>
      <div
        className="kit-flow-node-body"
        data-measure="node"
        style={{
          marginTop: inset.top,
          marginRight: inset.right,
          marginBottom: inset.bottom,
          marginLeft: inset.left,
        }}>
        {Icon === undefined ? null : (
          <span className="kit-flow-node-icon" data-diagram-part="icon">
            <Icon aria-hidden="true" focusable="false" />
          </span>
        )}
        <span className="kit-flow-node-text">{extras?.content ?? <NodeTitle node={node} />}</span>
      </div>
    </div>
  );
}

/**
 * Props of {@link NodeTitle}.
 */
type NodeTitleProps = {
  /**
   * The node.
   */
  node: FlowNodeSpec;
};

/**
 * A node's title and its quieter subtitle.
 */
function NodeTitle({ node }: NodeTitleProps): ReactNode {
  return (
    <>
      <span className="kit-flow-node-title kit-type-small">
        <BreakableText text={smartPunctuation(node.title)} />
      </span>
      {node.subtitle === undefined ? null : (
        <span className="kit-flow-node-subtitle kit-type-caption">
          <BreakableText text={smartPunctuation(node.subtitle)} />
        </span>
      )}
    </>
  );
}

/**
 * A long word with soft hyphens at its {@link hyphenPoints}, so where it must break it shows a
 * hyphen.
 *
 * @param word - The word.
 */
function softHyphens(word: string): string {
  const points = hyphenPoints(word);
  return [0, ...points]
    .map((start, index) => word.slice(start, points[index] ?? word.length))
    .join(SOFT_HYPHEN);
}

/**
 * Props of {@link BreakableText}.
 */
type BreakableTextProps = {
  /**
   * The text.
   */
  text: string;
};

/**
 * Text whose words may break only at their sensible points: a `<wbr>` at each camelCase or
 * separator boundary of a word ({@link wordPieces}), so a word too wide for its node breaks there
 * rather than at an arbitrary letter.
 */
function BreakableText({ text }: BreakableTextProps): ReactNode {
  return text.split(WHITESPACE_PARTS).map((part, index) =>
    WHITESPACE.test(part) || part === '' ? (
      part
    ) : (
      <Fragment key={index}>
        {wordPieces(part).map((piece, pieceIndex) => (
          <Fragment key={pieceIndex}>
            {pieceIndex === 0 ? null : <wbr />}
            {softHyphens(piece)}
          </Fragment>
        ))}
      </Fragment>
    ),
  );
}

/**
 * Props of {@link NodeBadge}.
 */
type NodeBadgeProps = {
  /**
   * The node.
   */
  node: FlowNodeSpec;

  /**
   * Its box.
   */
  rect: Rect;

  /**
   * What the step shows.
   */
  frame: NodeFrame;

  /**
   * Whether a focus dims it.
   */
  dimmed: boolean;

  /**
   * The corner {@link placeBadge} chose, clear of the edges where one is free.
   */
  corner: BadgeCorner;
};

/**
 * A node's status pill on a corner (the top right unless an edge runs there), in the label step,
 * its dot in the state's color. It is drawn beside the node rather than inside it, so it can stand
 * on the border.
 */
export function NodeBadge({ node, rect, frame, dimmed, corner }: NodeBadgeProps): ReactNode {
  if (frame.badge === undefined) {
    return null;
  }

  return (
    <span
      className="kit-flow-badge kit-type-label"
      data-diagram-part="badge"
      data-node={node.id}
      data-state={frame.state}
      data-corner={corner}
      data-lifted={flag(rect.width < BADGE_ON_EDGE_MIN_WIDTH)}
      data-dimmed={flag(dimmed)}
      data-decorative={presence(dimmed || frame.state === 'muted')}
      data-visible={String(frame.visible)}
      style={{
        left: corner.endsWith('right') ? rect.x + rect.width : rect.x,
        top: corner.startsWith('top') ? rect.y : rect.y + rect.height,
      }}>
      {frame.badge}
    </span>
  );
}
