/**
 * How a `<Step>` brings its content in: `rise` fades and rises into place (the default), `fade`
 * only fades, `scale` fades in while growing from slightly smaller, `blur` fades in from out of
 * focus, and `wipe` uncovers it from the start edge. Each takes its duration and easing from the
 * brand's motion tokens, and none of them moves anything in static mode or for reduced motion.
 */
export const STEP_EFFECTS = ['rise', 'fade', 'scale', 'blur', 'wipe'] as const;

/**
 * One of {@link STEP_EFFECTS}.
 */
export type StepEffect = (typeof STEP_EFFECTS)[number];

/**
 * The effect a step uses when it names none.
 */
export const DEFAULT_STEP_EFFECT: StepEffect = 'rise';

/**
 * Refuses an effect that is not one of {@link STEP_EFFECTS}, naming the ones there are, so a typo
 * in a slide fails where it is written instead of quietly falling back to the default.
 *
 * @param effect - The `effect` the slide set.
 * @throws Error naming the value and every effect a step takes.
 */
export function assertStepEffect(effect: string): asserts effect is StepEffect {
  if (!(STEP_EFFECTS as readonly string[]).includes(effect)) {
    throw new Error(
      `"${effect}" is not an effect of <Step>. Use one of ${STEP_EFFECTS.join(', ')}; ` +
        `the default is ${DEFAULT_STEP_EFFECT}.`,
    );
  }
}
