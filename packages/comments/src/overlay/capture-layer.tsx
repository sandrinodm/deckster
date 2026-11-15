import { useRef, useState, type PointerEvent, type ReactNode } from 'react';

import { commentsState, finishPick, startDraft, updateComments } from '#overlay/comments-state.ts';
import {
  parentTarget,
  targetAt,
  targetInRegion,
  toCanvasRect,
  type CanvasGeometry,
} from '#overlay/element-target.ts';

/**
 * How far the pointer must move while pressed before a press becomes a region drag, in viewport
 * pixels.
 */
const DRAG_THRESHOLD_PX = 6;

/**
 * Props of {@link CaptureLayer}.
 */
type CaptureLayerProps = {
  /**
   * Where the stage and canvas are.
   */
  geometry: CanvasGeometry;
};

/**
 * Where a press started, and the rectangle dragged from it so far.
 */
type Press = {
  /**
   * The viewport x of the press.
   */
  x: number;

  /**
   * The viewport y of the press.
   */
  y: number;

  /**
   * Whether the pointer moved far enough to drag a region.
   */
  dragging: boolean;
};

/**
 * A transparent layer over the stage while comment mode is on. It takes every pointer event, so
 * nothing on the slide reacts and the deck does not move: hovering highlights the element under the
 * pointer, a click selects it (Alt or Option-click selects its parent), and a drag draws a region.
 * The element is found with `elementsFromPoint`, under the layer.
 */
export function CaptureLayer({ geometry }: CaptureLayerProps): ReactNode {
  const press = useRef<Press | undefined>(undefined);
  const [region, setRegion] = useState<DOMRect | undefined>(undefined);
  const { stage } = geometry;

  /**
   * Starts a press.
   */
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    press.current = { x: event.clientX, y: event.clientY, dragging: false };
    updateComments({ hover: undefined });
  };

  /**
   * Highlights the element under the pointer, or grows the region being dragged.
   */
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = press.current;
    if (current === undefined) {
      updateHover(event.clientX, event.clientY);
      return;
    }

    const distance = Math.hypot(event.clientX - current.x, event.clientY - current.y);
    if (current.dragging || distance > DRAG_THRESHOLD_PX) {
      current.dragging = true;
      setRegion(rectBetween(current, { x: event.clientX, y: event.clientY }));
    }
  };

  /**
   * Ends a press: a drag becomes a region draft, a click selects the element.
   */
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const current = press.current;
    press.current = undefined;
    setRegion(undefined);
    if (current !== undefined) {
      finishPress(current, event, geometry);
    }
  };
  return (
    <div
      className="dc-capture"
      data-deck-interactive=""
      style={{ left: stage.left, top: stage.top, width: stage.width, height: stage.height }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => updateComments({ hover: undefined })}
      onContextMenu={(event) => event.preventDefault()}>
      {region === undefined ? null : (
        <div
          className="dc-region"
          style={{
            left: region.left - stage.left,
            top: region.top - stage.top,
            width: region.width,
            height: region.height,
          }}
        />
      )}
    </div>
  );
}

/**
 * Turns a finished press into a draft: a region for a drag, else the element under the pointer, or
 * its parent with Alt (Option) held.
 *
 * @param press - Where the press started and whether it dragged.
 * @param event - The pointer release.
 * @param geometry - Where the canvas is.
 */
function finishPress(press: Press, event: PointerEvent, geometry: CanvasGeometry): void {
  if (commentsState().pick !== undefined) {
    finishPickPress(press, event);
    return;
  }

  if (press.dragging) {
    const rect = rectBetween(press, { x: event.clientX, y: event.clientY });
    startDraft({
      kind: 'region',
      rect: toCanvasRect(rect, geometry),
      inside: targetInRegion(rect),
    });
    return;
  }

  const target = targetAt(event.clientX, event.clientY);
  if (target === undefined) {
    return;
  }

  const selected = event.altKey ? (parentTarget(target) ?? target) : target;
  startDraft({ kind: 'element', target: selected, trail: event.altKey ? [target] : [] });
}

/**
 * Ends a press while another tool picks an element: the element under the pointer (its parent with
 * Alt), or for a drag the element the region covers. Nothing found leaves the pick running.
 *
 * @param press - Where the press started and whether it dragged.
 * @param event - The pointer release.
 */
function finishPickPress(press: Press, event: PointerEvent): void {
  if (press.dragging) {
    const inside = targetInRegion(rectBetween(press, { x: event.clientX, y: event.clientY }));
    if (inside !== undefined) {
      finishPick(inside);
    }

    return;
  }

  const target = targetAt(event.clientX, event.clientY);
  if (target !== undefined) {
    finishPick(event.altKey ? (parentTarget(target) ?? target) : target);
  }
}

/**
 * Updates the hovered element, unless a draft is open.
 *
 * @param x - The viewport x.
 * @param y - The viewport y.
 */
function updateHover(x: number, y: number): void {
  const state = commentsState();
  if (state.draft !== undefined) {
    return;
  }

  const hover = targetAt(x, y);
  if (hover?.element !== state.hover?.element) {
    updateComments({ hover });
  }
}

/**
 * The rectangle two points span.
 *
 * @param a - One corner.
 * @param b - The opposite corner.
 */
function rectBetween(a: { x: number; y: number }, b: { x: number; y: number }): DOMRect {
  return new DOMRect(
    Math.min(a.x, b.x),
    Math.min(a.y, b.y),
    Math.abs(a.x - b.x),
    Math.abs(a.y - b.y),
  );
}
