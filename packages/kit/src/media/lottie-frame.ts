/**
 * Which frame static mode shows: a frame number, `'last'` for the final frame, or `'first'`.
 */
export type StaticFrame = number | 'first' | 'last';

/**
 * The frame to show without motion.
 *
 * @param choice - The author's choice; `'last'` when left out, which is where most animations come
 *   to rest.
 * @param totalFrames - How many frames the animation has.
 * @returns A frame number inside the animation.
 */
export function staticFrame(choice: StaticFrame | undefined, totalFrames: number): number {
  const last = Math.max(0, Math.floor(totalFrames) - 1);
  if (choice === 'first') {
    return 0;
  }

  if (choice === undefined || choice === 'last') {
    return last;
  }

  return Math.min(Math.max(0, Math.round(choice)), last);
}
