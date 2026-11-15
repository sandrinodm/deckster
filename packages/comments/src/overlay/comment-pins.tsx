import type { ReactNode } from 'react';

import type { AgentComment } from '#model/agent-comment.ts';

import { updateComments } from '#overlay/comments-state.ts';
import { elementForStamp, toViewportRect, type CanvasGeometry } from '#overlay/element-target.ts';
import { currentStamp } from '#overlay/labels.ts';

/**
 * How far a pin sits outside its element's top-left corner, in viewport pixels.
 */
const PIN_OFFSET_PX = 11;

/**
 * How far in from the canvas's right edge pins for comments on the whole slide sit, in viewport
 * pixels.
 */
const SLIDE_PIN_INSET_PX = 33;

/**
 * The spacing of pins that share a corner: along the element's top edge, or down the canvas's right
 * edge for comments on the whole slide.
 */
const PIN_SPACING_PX = 26;

/**
 * Props of {@link CommentPins}.
 */
type CommentPinsProps = {
  /**
   * The comments on the slide on screen whose step has been reached.
   */
  comments: readonly AgentComment[];

  /**
   * The deck folder relative to the workspace, to match stamps.
   */
  deckDir: string;

  /**
   * Where the canvas is.
   */
  geometry: CanvasGeometry;
};

/**
 * Numbered pins at the top-left corner of each commented element, found again by its current stamp,
 * else drawn where the element was; pins on the same element line up beside each other. Comments on
 * the whole slide stack down the canvas's top-right corner. A click opens the comment in the
 * panel.
 */
export function CommentPins({ comments, deckDir, geometry }: CommentPinsProps): ReactNode {
  const taken = new Map<string, number>();
  return comments.map((comment) => {
    const box = commentBox(comment, deckDir, geometry);
    const corner =
      box === undefined
        ? {
            left: geometry.canvas.right - SLIDE_PIN_INSET_PX,
            top: geometry.canvas.top + PIN_OFFSET_PX,
          }
        : { left: box.left - PIN_OFFSET_PX, top: box.top - PIN_OFFSET_PX };
    const key = `${Math.round(corner.left)},${Math.round(corner.top)}`;
    const stacked = taken.get(key) ?? 0;
    taken.set(key, stacked + 1);
    const position =
      box === undefined
        ? slidePinPosition(corner, stacked, geometry)
        : { left: corner.left + PIN_SPACING_PX * stacked, top: corner.top };
    return (
      <button
        key={comment.id}
        type="button"
        className="dc-pin"
        data-deck-interactive=""
        data-comment-id={comment.id}
        data-status={comment.status}
        data-anchor={comment.anchor.status}
        title={comment.text}
        aria-label={`Comment ${comment.number}: ${comment.text}`}
        style={position}
        onClick={() =>
          updateComments({ panelOpen: true, openId: comment.id, flashId: comment.id })
        }>
        {comment.number}
      </button>
    );
  });
}

/**
 * Where the n-th pin of a comment on the whole slide goes: down the canvas's right edge, then in
 * another column to the left once the canvas's height is used, so pins never run below the slide.
 *
 * @param corner - Where the first pin goes.
 * @param stacked - How many slide pins come before this one.
 * @param geometry - Where the canvas is.
 */
function slidePinPosition(
  corner: { left: number; top: number },
  stacked: number,
  geometry: CanvasGeometry,
): { left: number; top: number } {
  const rows = Math.max(1, Math.floor((geometry.canvas.height - PIN_OFFSET_PX) / PIN_SPACING_PX));
  const column = Math.floor(stacked / rows);
  const row = stacked % rows;
  return { left: corner.left - PIN_SPACING_PX * column, top: corner.top + PIN_SPACING_PX * row };
}

/**
 * Where a comment's element is now: the element its current stamp names, else its box from when the
 * comment was made; `undefined` for a comment on the whole slide.
 *
 * @param comment - The comment.
 * @param deckDir - The deck folder relative to the workspace.
 * @param geometry - Where the canvas is.
 */
export function commentBox(
  comment: AgentComment,
  deckDir: string,
  geometry: CanvasGeometry,
): DOMRect | undefined {
  const stamp = comment.target === 'element' ? currentStamp(comment, deckDir) : undefined;
  const element = stamp === undefined ? undefined : elementForStamp(stamp);
  if (element !== undefined) {
    return element.getBoundingClientRect();
  }

  const box = comment.region ?? comment.box;
  return box === null ? undefined : toViewportRect(box, geometry);
}
