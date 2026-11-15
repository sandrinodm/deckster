import { createStore, useStore } from '#state/store.ts';

/**
 * How long the tool cluster stays after the pointer last moved near it or a finger tapped its
 * corner, in milliseconds.
 */
export const TOOL_IDLE_MS = 2500;

/**
 * How far from the left edge the cluster's corner reaches, in CSS pixels.
 */
const ZONE_WIDTH_PX = 280;

/**
 * How far up from the bottom edge the cluster's corner reaches, in CSS pixels.
 */
const ZONE_HEIGHT_PX = 140;

/**
 * When the cluster was last asked to show, in milliseconds since the epoch; `undefined` before the
 * first time.
 */
export const toolReveals = createStore<number | undefined>(undefined);

/**
 * Reads when the cluster was last asked to show.
 */
export function useToolReveal(): number | undefined {
  return useStore(toolReveals);
}

/**
 * Whether a point is in the bottom-left corner the cluster lives in.
 *
 * @param x - Distance from the left edge of the viewport.
 * @param y - Distance from the top edge of the viewport.
 * @param viewportHeight - The viewport's height.
 */
export function isInToolZone(x: number, y: number, viewportHeight: number): boolean {
  return x <= ZONE_WIDTH_PX && y >= viewportHeight - ZONE_HEIGHT_PX;
}

/**
 * The deck plugin's pointer handler for the tool cluster: a finger tap in its corner shows the
 * cluster instead of moving the deck. Mouse clicks there still navigate.
 *
 * @param event - The click on the stage.
 * @returns `true` when the tap was for the cluster.
 */
export function revealToolsOnTap(event: MouseEvent): boolean {
  const pointerType: unknown = Reflect.get(event, 'pointerType');
  if (pointerType !== 'touch' || !isInToolZone(event.clientX, event.clientY, window.innerHeight)) {
    return false;
  }

  toolReveals.set(Date.now());
  return true;
}
