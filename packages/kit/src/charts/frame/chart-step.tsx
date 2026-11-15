import { useStatic, useStepAt, type StepState } from '@deckster/engine';
import { useState, type ReactNode } from 'react';

/**
 * How a revealed group shows: `hidden` before its step, `shown` in place (it was visible when the
 * slide appeared, or the deck is static), or `play` when it was just revealed and its marks build.
 */
export type RevealState = 'hidden' | 'shown' | 'play';

/**
 * Props of {@link ChartStep}.
 */
type ChartStepProps = {
  /**
   * The step that reveals the group; always shown when left out.
   */
  at: number | undefined;

  /**
   * Classes for the group.
   */
  className?: string;

  /**
   * The marks, labels or annotation in the group.
   */
  children?: ReactNode;
};

/**
 * A group of SVG marks revealed at a step: hidden (and out of the accessibility tree) before it,
 * building in with the kit's chart motion when the deck steps onto it, and in place in static mode
 * and on later visits. The marks inside choose their build with `data-anim`.
 */
export function ChartStep({ at, className, children }: ChartStepProps): ReactNode {
  const reveal = useReveal(at);
  if (at === undefined) {
    return <g className={className}>{children}</g>;
  }

  return (
    <g
      className={className === undefined ? 'kit-chart-step' : `kit-chart-step ${className}`}
      data-step={at}
      data-reveal={reveal}>
      {children}
    </g>
  );
}

/**
 * The reveal state of content shown from step `at`: it registers the step on the slide, and turns
 * to `play` only when the deck steps from before `at` onto it while the slide is live, so stepping
 * back and forward builds again but static renders never move.
 *
 * @param at - The step, or `undefined` for content that is always shown.
 */
export function useReveal(at: number | undefined): RevealState {
  const state = useStepAt(at);
  const isStatic = useStatic();
  const [seen, setSeen] = useState<{ state: StepState; reveal: RevealState }>(() => ({
    state,
    reveal: state === 'hidden' ? 'hidden' : 'shown',
  }));
  if (seen.state !== state) {
    const reveal = revealAfter(seen, state, isStatic);
    setSeen({ state, reveal });
  }

  return seen.reveal;
}

/**
 * The reveal state after a step change.
 *
 * @param before - The step state and reveal before; a build in progress keeps playing.
 * @param after - The step state now.
 * @param isStatic - Whether the deck is static.
 */
function revealAfter(
  before: { state: StepState; reveal: RevealState },
  after: StepState,
  isStatic: boolean,
): RevealState {
  if (after === 'hidden') {
    return 'hidden';
  }

  if (before.state !== 'hidden') {
    return before.reveal;
  }

  return isStatic ? 'shown' : 'play';
}
