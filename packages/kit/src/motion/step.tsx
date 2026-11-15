import type { ReactNode } from 'react';

import { useStatic, useStepAt, type StepProps } from '@deckster/engine';

import { checkComponentProps } from '#components/check-component-props.ts';

/**
 * The kit's `Step`, which replaces the engine's for MDX and TSX slides alike. Content keeps its
 * space while hidden, as with the engine's, and each element in it fades and rises into place with
 * the brand's durations and easing when its step is reached, and fades out when the deck steps
 * back. In static mode it shows or hides with no motion, so screenshots and exports see final
 * frames.
 */
export function Step(props: StepProps): ReactNode {
  checkComponentProps('Step', props);
  const { at, children } = props;
  const state = useStepAt(at);
  const isStatic = useStatic();
  return (
    <span
      className="deck-step kit-step"
      data-step={at}
      data-step-state={state}
      data-motion={isStatic ? 'off' : 'on'}>
      {children}
    </span>
  );
}
