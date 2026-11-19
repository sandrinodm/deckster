import { useStepAt } from '@deckster/engine';

/**
 * Returns the authored phase of a short demo. Direct step jumps, reverse and replay use the same
 * landmarks as normal advances. Omitting a reveal starts at the complete state.
 *
 * @param reveal - Whether to register the authored phase transitions.
 */
export function useDemoPhase(reveal: boolean): number {
  const first = useStepAt(reveal ? 1 : undefined);
  const second = useStepAt(reveal ? 2 : undefined);
  if (second !== 'hidden') {
    return 2;
  }

  return first === 'hidden' ? 0 : 1;
}
