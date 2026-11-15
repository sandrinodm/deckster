import type { ReactNode } from 'react';

import { useStepAt } from '@deckster/engine';

/**
 * Props of {@link StepMarks}.
 */
type StepMarksProps = {
  /**
   * The slide steps to register, each an integer of 1 or more.
   */
  ats: readonly number[];
};

/**
 * Registers slide steps for a component that reacts to the current step but reveals nothing of its
 * own, such as the line highlights of a code block. Each step becomes a key press in the deck, like
 * a `<Step at>`, for as long as the component is mounted.
 */
export function StepMarks({ ats }: StepMarksProps): ReactNode {
  return ats.map((at) => <StepMark key={at} at={at} />);
}

/**
 * Props of {@link StepMark}.
 */
type StepMarkProps = {
  /**
   * The step to register.
   */
  at: number;
};

/**
 * Registers one step and renders nothing.
 */
function StepMark({ at }: StepMarkProps): ReactNode {
  useStepAt(at);
  return null;
}
