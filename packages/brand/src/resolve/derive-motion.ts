import type { Brand } from '#schema/brand-schema.ts';

import { ownValue } from '#resolve/own-value.ts';
import { MAX_DURATION_MS } from '#schema/presentation-schema.ts';

/**
 * The easings the kit's motion reads (`--brand-ease-<name>`), which every resolved brand defines:
 * `standard` for fades and colour changes, `emphasized` for things that move into place (the slide
 * entrance, step reveals, chart builds) and `exit` for things that leave.
 */
export const MOTION_EASING_NAMES = ['standard', 'emphasized', 'exit'] as const;

/**
 * The durations the kit's motion reads (`--brand-duration-<name>`), which every resolved brand
 * defines: `fast` for staggers and small changes, `base` for step reveals and `slow` for entrances
 * and builds.
 */
export const MOTION_DURATION_NAMES = ['fast', 'base', 'slow'] as const;

/**
 * An easing the kit's motion reads.
 */
export type MotionEasingName = (typeof MOTION_EASING_NAMES)[number];

/**
 * A duration the kit's motion reads.
 */
export type MotionDurationName = (typeof MOTION_DURATION_NAMES)[number];

/**
 * An easing curve as `[x1, y1, x2, y2]`, as in CSS `cubic-bezier()`.
 */
type Curve = readonly [number, number, number, number];

/**
 * CSS's own `ease`, the last resort when a brand names no easing the kit can use.
 */
const CSS_EASE: Curve = [0.25, 0.1, 0.25, 1];

/**
 * The `base` duration in milliseconds when a brand names neither `base` nor a transition duration
 * that resolves.
 */
const DEFAULT_BASE_MS = 300;

/**
 * `fast` as a share of `base`, when a brand leaves `fast` out; the built-in brands sit between 0.46
 * and 0.57.
 */
const FAST_SHARE_OF_BASE = 0.5;

/**
 * `slow` as a multiple of `base`, when a brand leaves `slow` out; the built-in brands sit between
 * 1.64 and 1.75.
 */
const SLOW_MULTIPLE_OF_BASE = 1.7;

/**
 * The brand's easings and durations with every name the kit reads filled in. The motion records are
 * open, so a brand that passes validation may define only some of them (`standard` and `base`,
 * say), and a CSS declaration that reads a custom property that does not exist is dropped whole:
 * the entrance, step reveals and chart builds would not play at all. A name the brand defines keeps
 * its value; a missing one is derived from what the brand does define:
 *
 * - `standard` is the default transition's easing, or CSS's `ease` when that does not resolve;
 *   `emphasized` and `exit` are `standard`.
 * - `base` is the default transition's duration, or {@link DEFAULT_BASE_MS}; `fast` is half of `base`
 *   and `slow` 1.7 times it (at most {@link MAX_DURATION_MS}), rounded to whole milliseconds.
 *
 * The kit's names come first, in the order of {@link MOTION_EASING_NAMES} and
 * {@link MOTION_DURATION_NAMES}, then the brand's own other names in its order.
 *
 * @param motion - The motion section as the brand writes it.
 * @returns The easings and durations, by name.
 */
export function completeMotion(motion: Brand['motion']): {
  easings: Readonly<Record<MotionEasingName, Curve>> & Readonly<Record<string, Curve>>;
  durations: Readonly<Record<MotionDurationName, number>> & Readonly<Record<string, number>>;
} {
  return {
    easings: { ...kitEasings(motion), ...motion.easings },
    durations: { ...kitDurations(motion), ...motion.durations },
  };
}

/**
 * The kit's easings, each the brand's own when it has one.
 *
 * @param motion - The motion section.
 */
function kitEasings(motion: Brand['motion']): Record<MotionEasingName, Curve> {
  const { easings, transition } = motion;
  const standard =
    ownValue(easings, 'standard') ?? ownValue(easings, transition.easing) ?? CSS_EASE;
  return {
    standard,
    emphasized: ownValue(easings, 'emphasized') ?? standard,
    exit: ownValue(easings, 'exit') ?? standard,
  };
}

/**
 * The kit's durations, each the brand's own when it has one.
 *
 * @param motion - The motion section.
 */
function kitDurations(motion: Brand['motion']): Record<MotionDurationName, number> {
  const { durations, transition } = motion;
  const base =
    ownValue(durations, 'base') ?? ownValue(durations, transition.duration) ?? DEFAULT_BASE_MS;
  return {
    fast: ownValue(durations, 'fast') ?? Math.round(base * FAST_SHARE_OF_BASE),
    base,
    slow:
      ownValue(durations, 'slow') ??
      Math.min(Math.round(base * SLOW_MULTIPLE_OF_BASE), MAX_DURATION_MS),
  };
}
