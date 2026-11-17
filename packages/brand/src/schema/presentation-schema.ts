import { TRANSITION_KINDS } from '@deckster/engine/frontmatter';
import { Schema } from 'effect';

import { Corner, KebabName, Pixels } from '#schema/primitives.ts';

/**
 * The placeholder for the slide number, which every page number format must contain.
 */
export const PAGE_NUMBER_PLACEHOLDER = '{n}';

/**
 * The placeholder for the slide count, which a page number format may contain.
 */
export const PAGE_TOTAL_PLACEHOLDER = '{total}';

/**
 * Longest slide transition allowed; longer ones make the presenter wait.
 */
export const MAX_DURATION_MS = 3000;

/**
 * How far an easing curve's y control points may reach beyond 0 and 1.
 */
export const MAX_BEZIER_Y = 5;

/**
 * Slide transitions the engine knows how to run, and the type of one. The engine owns the list, so
 * a brand's default and a slide's `transition:` frontmatter accept the same kinds.
 */
export { TRANSITION_KINDS, type TransitionKind } from '@deckster/engine/frontmatter';

/**
 * Bézier control-point x values must stay in 0..1 for the curve to be a function of time.
 */
const BezierX = Schema.Finite.check(
  Schema.isBetween(
    { minimum: 0, maximum: 1 },
    { message: 'Expected an x control point from 0 to 1' },
  ),
);

/**
 * `[x1, y1, x2, y2]`, as in CSS `cubic-bezier()`.
 */
/**
 * A y control point of an easing curve, which may overshoot 0 and 1 for a bounce.
 */
const BezierY = Schema.Finite.check(
  Schema.isBetween(
    { minimum: -MAX_BEZIER_Y, maximum: MAX_BEZIER_Y },
    { message: `Expected a y control point from -${MAX_BEZIER_Y} to ${MAX_BEZIER_Y}` },
  ),
);

/**
 * A cubic Bézier curve `[x1, y1, x2, y2]`, as CSS `cubic-bezier()` takes it.
 */
const Easing = Schema.Tuple([BezierX, BezierY, BezierX, BezierY]);

/**
 * A duration in milliseconds, up to {@link MAX_DURATION_MS}.
 */
const Duration = Schema.Finite.check(
  Schema.isBetween(
    { minimum: 0, maximum: MAX_DURATION_MS },
    { message: `Expected a duration in milliseconds from 0 to ${MAX_DURATION_MS}` },
  ),
);

/**
 * The name of an easing curve, as the transition and the easing table refer to it.
 */
const EasingName = KebabName('easing name', 'standard');

/**
 * The name of a duration, as the transition and the duration table refer to it.
 */
const DurationName = KebabName('duration name', 'base');

/**
 * The `motion` section: named easing curves and durations, and the default slide transition, which
 * names one of each.
 */
export const BrandMotion = Schema.Struct({
  easings: Schema.Record(EasingName, Easing),
  durations: Schema.Record(DurationName, Duration),
  transition: Schema.Struct({
    kind: Schema.Literals(TRANSITION_KINDS),
    duration: DurationName,
    easing: EasingName,
  }),
});

/**
 * The `chrome` section: what the engine draws around slides. `skipFirst` hides chrome on the first
 * slide, which is usually the title. Page number formats use `{n}` and `{total}`.
 */
export const BrandChrome = Schema.Struct({
  pageNumber: Schema.Struct({
    show: Schema.Boolean,
    format: Schema.String.check(
      Schema.makeFilter((format: string) => format.includes(PAGE_NUMBER_PLACEHOLDER), {
        message: `Expected a format containing ${PAGE_NUMBER_PLACEHOLDER}, such as "{n} / {total}"`,
      }),
    ),
    corner: Corner,
  }),
  footer: Schema.Struct({
    show: Schema.Boolean,
    text: Schema.String,
    corner: Corner,
  }),
  progress: Schema.Struct({
    show: Schema.Boolean,
    edge: Schema.Literals(['top', 'bottom']),
    thickness: Pixels,
  }),
  logo: Schema.Struct({ show: Schema.Boolean }),
  skipFirst: Schema.Boolean,
});
