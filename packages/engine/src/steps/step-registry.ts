/**
 * The steps of a slide with nothing registered: only step 0.
 */
const NO_STEPS: readonly number[] = [];

/**
 * Collects the `at` values of the steps mounted on one slide. Gaps are compacted: the slide has one
 * deck step per distinct `at` plus step 0, so `<Step at={1}>` and `<Step at={3}>` give steps 0, 1
 * and 2, where deck step 2 reveals `at={3}`. No key press is dead and no export page repeats
 * another. Slide code still sees the `at` numbers it wrote: `useStep()` returns the `at` of the
 * latest revealed step.
 */
export type StepRegistry = {
  /**
   * Registers a step and returns the function that removes it. Registering the same `at` twice is
   * allowed; it stays until every registration of it is removed.
   *
   * @throws RangeError when `at` is not an integer of 1 or more.
   */
  register: (at: number) => () => void;

  /**
   * The distinct registered `at` values in ascending order. The same array is returned until the
   * set changes.
   */
  getSteps: () => readonly number[];

  /**
   * The slide's deck step count: one per distinct `at`, plus step 0.
   */
  getStepCount: () => number;

  /**
   * Calls `listener` whenever the set of distinct `at` values changes; returns the unsubscribe
   * function.
   */
  subscribe: (listener: () => void) => () => void;
};

/**
 * Creates an empty step registry for one slide.
 *
 * @returns A registry with no steps, so a step count of 1.
 */
export function createStepRegistry(): StepRegistry {
  const counts = new Map<number, number>();
  const listeners = new Set<() => void>();
  let steps = NO_STEPS;

  /**
   * Recomputes the distinct steps and notifies the listeners when they changed.
   */
  const update = (): void => {
    const next = [...counts.keys()].sort((a, b) => a - b);
    if (sameSteps(next, steps)) {
      return;
    }

    steps = next;
    for (const listener of listeners) {
      listener();
    }
  };

  /**
   * Removes one registration of `at` and recomputes the steps.
   *
   * @param at - The step to remove.
   */
  const unregister = (at: number): void => {
    const remaining = (counts.get(at) ?? 1) - 1;
    if (remaining === 0) {
      counts.delete(at);
    } else {
      counts.set(at, remaining);
    }

    update();
  };

  return {
    register: (at) => {
      assertValidStep(at);
      counts.set(at, (counts.get(at) ?? 0) + 1);
      update();
      let registered = true;
      return () => {
        if (registered) {
          registered = false;
          unregister(at);
        }
      };
    },
    getSteps: () => steps,
    getStepCount: () => steps.length + 1,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * The `at` value a slide shows at a deck step: 0 at step 0, else the `at` of the step-th distinct
 * registered step. A deck step past the last step shows the last one.
 *
 * @param steps - The distinct registered `at` values, ascending.
 * @param deckStep - The zero-based deck step; negative values count as 0.
 */
export function stepValueAt(steps: readonly number[], deckStep: number): number {
  const index = Math.min(Math.max(0, deckStep), steps.length);
  return index === 0 ? 0 : (steps[index - 1] ?? 0);
}

/**
 * Checks a step number given to `<Step at>` or `useStepAt`.
 *
 * @throws RangeError naming the fix when `at` is not an integer of 1 or more.
 */
export function assertValidStep(at: number): void {
  if (!Number.isInteger(at) || at < 1) {
    throw new RangeError(
      `<Step at={${at}}> is not a valid step. Use an integer of 1 or more: ` +
        'step 0 is the slide before any step is revealed.',
    );
  }
}

/**
 * Whether two ascending step lists hold the same values.
 *
 * @param a - One list.
 * @param b - The other list.
 */
function sameSteps(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
