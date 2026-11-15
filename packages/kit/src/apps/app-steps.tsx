import type { ReactNode } from 'react';

import { useStepAt } from '@deckster/engine';

/**
 * Props of {@link AppSteps}.
 */
type AppStepsProps = {
  /**
   * How many steps the slide has for the app: it registers steps 1 to `count`.
   */
  count: number;
};

/**
 * Gives the slide `count` steps for the app to drive, one registration each, so the audience's
 * clicker advances the app before it advances the slide. It renders nothing.
 */
export function AppSteps({ count }: AppStepsProps): ReactNode {
  return Array.from({ length: count }, (_, index) => <AppStep key={index} at={index + 1} />);
}

/**
 * Props of {@link AppStep}.
 */
type AppStepProps = {
  /**
   * The step to register.
   */
  at: number;
};

/**
 * Registers one step on the enclosing slide while it is mounted.
 */
function AppStep({ at }: AppStepProps): null {
  useStepAt(at);
  return null;
}
