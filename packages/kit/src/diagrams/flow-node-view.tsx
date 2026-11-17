import { Fragment, useId, type CSSProperties, type ReactNode } from 'react';

import type { BadgeCorner } from '#diagrams/badge-placement.ts';
import type { NodeFrame } from '#diagrams/choreography.ts';
import type { NodeExtras } from '#diagrams/flow-children.ts';
import type { FlowNodeSpec } from '#diagrams/flow-spec.ts';
import type { Rect } from '#diagrams/geometry.ts';
import type { CardTokens, ResolvedCard } from '#diagrams/node-cards.ts';
import type { ShapeGeometry } from '#diagrams/node-shapes.ts';

import { BADGE_ON_EDGE_MIN_WIDTH } from '#diagrams/badge-placement.ts';
import { flag, presence } from '#diagrams/data-flags.ts';
import { cardData, cardStyle } from '#diagrams/node-cards.ts';
import { NODE_KINDS } from '#diagrams/node-kinds.ts';
import { cardShape } from '#diagrams/node-shapes.ts';
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
 * Characters a React id may hold that an SVG `url(#…)` reference should not; they are dropped.
 */
const NON_SVG_ID_CHARACTERS = /[^a-zA-Z0-9_-]/g;

/**
 * How far around a node its shadow may reach, in canvas pixels: the mask that keeps the shadow
 * outside the node covers this much room.
 */
const SHADOW_ROOM = 480;

/**
 * An id for an element the node's SVG refers to (a clip path, a mask), unique on the page.
 */
function useSvgId(): string {
  return `kit-${useId().replace(NON_SVG_ID_CHARACTERS, '')}`;
}

/**
 * Props of {@link NodeShape}.
 */
type NodeShapeProps = {
  /**
   * The node.
   */
  node: FlowNodeSpec;

  /**
   * The card it is drawn with.
   */
  card: ResolvedCard;

  /**
   * Its box.
   */
  rect: Rect;

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
 * emphasis, the outline, the card's accent stripe (clipped to the outline) and the detail lines,
 * plus the ring that pulses when a packet lands. The card's paint reaches the paths through the
 * `--kit-card-*` variables set on the group. With a stripe the outline is split so the stripe sits
 * between its fill and its stroke: halo, back layer, outline fill (`kit-flow-outline-fill`),
 * stripe, outline stroke (`kit-flow-outline-stroke`), details, pulse.
 */
export function NodeShape({
  node,
  card,
  rect,
  geometry,
  frame,
  dimmed,
  arrivalDelay,
}: NodeShapeProps): ReactNode {
  const clipId = useSvgId();
  const accent = accentRect(card.tokens.accent, rect, geometry.inset);
  return (
    <g
      className="kit-flow-shape"
      style={
        {
          ...cardStyle(card),
          '--kit-arrival-delay': `${Math.round(arrivalDelay)}ms`,
        } as CSSProperties
      }
      data-diagram-part="node-shape"
      data-node={node.id}
      {...cardData(card)}
      data-card-fill={card.tokens.nodeFill ? undefined : 'own'}
      data-grouped={flag(node.group !== undefined)}
      data-state={frame.state}
      data-arrival={flag(frame.arrival)}
      data-dimmed={flag(dimmed)}
      data-visible={String(frame.visible)}
      data-dashed={flag(geometry.dashed)}>
      <path className="kit-flow-halo" d={geometry.outline} />
      {geometry.under === '' ? null : <path className="kit-flow-under" d={geometry.under} />}
      {accent === undefined ? (
        <path className="kit-flow-outline" d={geometry.outline} />
      ) : (
        <>
          <path className="kit-flow-outline kit-flow-outline-fill" d={geometry.outline} />
          <clipPath id={clipId}>
            <path d={geometry.outline} />
          </clipPath>
          <rect
            className="kit-flow-accent"
            data-diagram-part="node-accent"
            data-side={card.tokens.accent.side}
            clipPath={`url(#${clipId})`}
            x={accent.x}
            y={accent.y}
            width={accent.width}
            height={accent.height}
          />
          <path className="kit-flow-outline kit-flow-outline-stroke" d={geometry.outline} />
        </>
      )}
      {geometry.details === '' ? null : <path className="kit-flow-details" d={geometry.details} />}
      <path className="kit-flow-pulse" data-motion={`pulse:${node.id}`} d={geometry.outline} />
    </g>
  );
}

/**
 * The box of a card's accent stripe, before it is clipped to the node's outline: along the card's
 * side of the node's box, as deep as the stripe's width plus the room the shape takes on that side
 * (so on a cylinder's lid or a window's bar it fills that end), and so never under the text.
 *
 * @param accent - The card's accent.
 * @param rect - The node's box.
 * @param inset - The room the shape takes at each side.
 * @returns The stripe's box; `undefined` for a card without an accent.
 */
export function accentRect(
  accent: CardTokens['accent'],
  rect: Rect,
  inset: ShapeGeometry['inset'],
): Rect | undefined {
  if (accent.side === 'none' || accent.width <= 0) {
    return undefined;
  }

  const depth = Math.min(
    inset[accent.side] + accent.width,
    accent.side === 'left' || accent.side === 'right' ? rect.width : rect.height,
  );
  switch (accent.side) {
    case 'left':
      return { x: rect.x, y: rect.y, width: depth, height: rect.height };
    case 'right':
      return { x: rect.x + rect.width - depth, y: rect.y, width: depth, height: rect.height };
    case 'top':
      return { x: rect.x, y: rect.y, width: rect.width, height: depth };
    case 'bottom':
      return { x: rect.x, y: rect.y + rect.height - depth, width: rect.width, height: depth };
  }
}

/**
 * Props of {@link NodeShadow}.
 */
type NodeShadowProps = {
  /**
   * The node.
   */
  node: FlowNodeSpec;

  /**
   * The card it is drawn with.
   */
  card: ResolvedCard;

  /**
   * Its box.
   */
  rect: Rect;

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
};

/**
 * The shadow a node's card casts, drawn in the diagram's lower SVG under the edges and arrowheads:
 * a copy of the outline (and a stacked shape's back layer) with the card's `drop-shadow()` filter,
 * masked so only the shadow outside the outline shows. Like a CSS box shadow it never shows through
 * a translucent fill, and a card without a fill still casts the shadow of its whole shape. An empty
 * rectangle well beyond the node widens the cast's box, and so the filter's region (a share of that
 * box), so a large blur or offset is never cut off; the mask covers the same room. It takes no room
 * in the layout: the node's box is unchanged. Nothing is drawn for a card without a shadow.
 */
export function NodeShadow({
  node,
  card,
  rect,
  geometry,
  frame,
  dimmed,
}: NodeShadowProps): ReactNode {
  const maskId = useSvgId();
  if (!card.defined || !card.tokens.shadow) {
    return null;
  }

  return (
    <g
      className="kit-flow-shadow"
      style={cardStyle(card)}
      data-diagram-part="node-shadow"
      data-node={node.id}
      data-card={card.name}
      data-state={frame.state}
      data-dimmed={flag(dimmed)}
      data-visible={String(frame.visible)}
      mask={`url(#${maskId})`}>
      <mask
        id={maskId}
        maskUnits="userSpaceOnUse"
        x={rect.x - SHADOW_ROOM}
        y={rect.y - SHADOW_ROOM}
        width={rect.width + 2 * SHADOW_ROOM}
        height={rect.height + 2 * SHADOW_ROOM}>
        <rect
          fill="white"
          x={rect.x - SHADOW_ROOM}
          y={rect.y - SHADOW_ROOM}
          width={rect.width + 2 * SHADOW_ROOM}
          height={rect.height + 2 * SHADOW_ROOM}
        />
        <path fill="black" d={geometry.outline} />
        {geometry.under === '' ? null : <path fill="black" d={geometry.under} />}
      </mask>
      <g className="kit-flow-shadow-cast">
        <rect
          className="kit-flow-shadow-room"
          fill="none"
          x={rect.x - SHADOW_ROOM}
          y={rect.y - SHADOW_ROOM}
          width={rect.width + 2 * SHADOW_ROOM}
          height={rect.height + 2 * SHADOW_ROOM}
        />
        <path d={geometry.outline} />
        {geometry.under === '' ? null : <path d={geometry.under} />}
      </g>
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
   * The card it is drawn with.
   */
  card: ResolvedCard;

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
 * type steps so they never scale below the brand's sizes, in its card's colours and title font.
 */
export function NodeBody({
  node,
  card,
  extras,
  rect,
  inset,
  frame,
  dimmed,
  arrivalDelay,
}: NodeBodyProps): ReactNode {
  const Icon = card.tokens.icon === 'none' ? undefined : extras?.icon;
  const shape = cardShape(NODE_KINDS[node.kind].shape, card.tokens.shape);
  const style = {
    ...cardStyle(card),
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
      {...cardData(card)}
      data-icon={card.tokens.icon === 'chip' ? undefined : card.tokens.icon}
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
