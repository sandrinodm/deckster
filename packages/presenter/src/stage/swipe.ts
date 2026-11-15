/**
 * The least horizontal travel that counts as a swipe, in CSS pixels.
 */
const MIN_SWIPE_DISTANCE_PX = 50;

/**
 * How much more horizontal than vertical a swipe must be, so scrolling and diagonal drags do not
 * move the deck.
 */
const HORIZONTAL_DOMINANCE = 1.6;

/**
 * The longest a swipe may take, in milliseconds; slower drags are not swipes.
 */
const MAX_SWIPE_MS = 800;

/**
 * Which way a finger moved the deck.
 */
export type SwipeDirection = 'next' | 'prev';

/**
 * Reads a touch gesture on the stage: a quick, mostly horizontal drag left goes to the next step,
 * right to the previous one.
 *
 * @param gesture - How far the finger moved and how long it took.
 * @returns The direction, or `undefined` when the gesture is not a swipe.
 */
export function swipeDirection(gesture: {
  dx: number;
  dy: number;
  durationMs: number;
}): SwipeDirection | undefined {
  const { dx, dy, durationMs } = gesture;
  const isSwipe =
    Math.abs(dx) >= MIN_SWIPE_DISTANCE_PX &&
    Math.abs(dx) >= Math.abs(dy) * HORIZONTAL_DOMINANCE &&
    durationMs <= MAX_SWIPE_MS;
  if (!isSwipe) {
    return undefined;
  }

  return dx < 0 ? 'next' : 'prev';
}
