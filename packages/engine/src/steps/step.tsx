import { useContext, useLayoutEffect, type ReactNode } from 'react';

import { DeckRuntimeContext } from '#deck/deck-runtime.ts';
import {
  outsideSlideError,
  SlideContext,
  useSlideContext,
  type SlideContextValue,
} from '#steps/slide-context.ts';
import { assertValidStep, stepValueAt } from '#steps/step-registry.ts';

/**
 * Where a step stands relative to the slide's current step: not reached yet, the step just
 * revealed, or revealed earlier.
 */
export type StepState = 'hidden' | 'current' | 'past';

/**
 * Props for {@link Step}.
 */
export type StepProps = {
  /**
   * The step that reveals the children; an integer of 1 or more, required. Gaps are allowed and
   * compacted: steps at 1 and 3 take two key presses. A `<Step>` without it is refused (the build
   * fails on one in MDX, a TSX slide shows the error), since it would never hide anything.
   */
  at: number;

  /**
   * The content to reveal; it keeps its space while hidden.
   */
  children?: ReactNode;
};

/**
 * The slide's current step, as the `at` value of the latest revealed step: 0 before any, never more
 * than the highest `at` registered on the slide. Steps are compacted, so with steps at 1 and 3 this
 * goes 0, 1, 3 while the deck (and the URL hash) count 0, 1, 2.
 *
 * @returns The current step.
 * @throws Error when called outside a slide.
 */
export function useStep(): number {
  return currentStepValue(useSlideContext('useStep()'));
}

/**
 * Registers step `at` on the enclosing slide for as long as the component is mounted, and reports
 * whether that step has been reached. Kit components with an optional `at` prop are built on this:
 * without `at` nothing is registered and the content counts as revealed.
 *
 * @param at - The step that reveals the component, an integer of 1 or more; `undefined` for content
 *   that is always shown.
 * @returns The step's state relative to the slide's current step; `past` when `at` is
 * `undefined`.
 * @throws RangeError when `at` is not an integer of 1 or more; Error when `at` is given outside a
 *   slide.
 */
export function useStepAt(at: number | undefined): StepState {
  if (at !== undefined) {
    assertValidStep(at);
  }

  const slide = useContext(SlideContext);
  const registry = slide?.registry;
  useLayoutEffect(() => {
    if (at === undefined || registry === undefined) {
      return undefined;
    }

    return registry.register(at);
  }, [registry, at]);
  if (at === undefined) {
    return 'past';
  }

  if (slide === undefined) {
    throw outsideSlideError('useStepAt()');
  }

  const value = currentStepValue(slide);
  if (value < at) {
    return 'hidden';
  }

  return value === at ? 'current' : 'past';
}

/**
 * Reveals its children from step `at` on. Hidden content keeps its space, so revealing a step never
 * reflows the slide.
 *
 * Import it from `@deckster/engine` in TSX slides; MDX slides get it without an import. When a
 * plugin registers its own `Step` in `components` (an animated one from the kit, say), this renders
 * that one, so MDX and TSX slides reveal steps the same way.
 */
export function Step(props: StepProps): ReactNode {
  const Override = useContext(DeckRuntimeContext)?.runtime.stepOverride;
  if (Override !== undefined) {
    return <Override {...props} />;
  }

  return <PlainStep {...props} />;
}

/**
 * The engine's own step: shown or hidden with `visibility`, no motion. It refuses a missing `at`,
 * which `useStepAt` would read as content that always shows.
 *
 * @throws RangeError when `at` is missing or not an integer of 1 or more.
 */
function PlainStep({ at, children }: StepProps): ReactNode {
  assertValidStep(at);
  const state = useStepAt(at);
  return (
    <span className="deck-step" data-step={at} data-step-state={state}>
      {children}
    </span>
  );
}

/**
 * The `at` value a slide shows now: its requested deck step mapped through its registered steps.
 *
 * @param slide - The enclosing slide.
 */
function currentStepValue(slide: SlideContextValue): number {
  return stepValueAt(slide.steps, slide.step);
}
