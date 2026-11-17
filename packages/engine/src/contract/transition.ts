/**
 * The slide transitions a deck can ask for, in a brand's `motion.transition.kind` and in a slide's
 * `transition:` frontmatter. The engine owns the list so the brand schema and the frontmatter
 * schema validate against the same names; the kit's motion stylesheet draws each one.
 *
 * - `none`: the next slide replaces the current one at once.
 * - `fade`: the next slide fades in over the current one.
 * - `slide`: the next slide fades in while moving a short way in from its side: from the right going
 *   forward, from the left going back.
 * - `rise`: the same, vertically: up from below going forward, down from above going back.
 * - `push`: the next slide pushes the current one off, the two edge to edge.
 * - `cover`: the next slide moves in over the current one, which stays in place.
 * - `wipe`: an edge sweeps across and uncovers the next slide over the current one, which stays in
 *   place.
 * - `zoom`: the next slide fades in while settling from slightly smaller (slightly larger going
 *   back).
 */
export const TRANSITION_KINDS = [
  'none',
  'fade',
  'slide',
  'rise',
  'push',
  'cover',
  'wipe',
  'zoom',
] as const;

/**
 * A slide transition kind.
 */
export type TransitionKind = (typeof TRANSITION_KINDS)[number];

/**
 * The transition kinds as an English list, `"none", "fade", … or "zoom"`, for fix hints.
 */
export const TRANSITION_KIND_LIST = quotedList(TRANSITION_KINDS);

/**
 * Joins names as `"a", "b" or "c"`.
 *
 * @param names - The names, at least two.
 */
function quotedList(names: readonly string[]): string {
  const quoted = names.map((name) => `"${name}"`);
  return `${quoted.slice(0, -1).join(', ')} or ${quoted.at(-1)}`;
}
