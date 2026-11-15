/**
 * Counts the holds on each slide's readiness. A component holds its slide while it is still loading
 * something the slide's final look depends on (highlighted code, a laid-out diagram, chart data, an
 * iframe, steps it has not registered yet); `window.__deck.ready()` waits until the slides it
 * covers have no holds left.
 */
export type ReadinessRegistry = {
  /**
   * Adds a hold on a slide and returns the function that releases it; calling that more than once
   * releases once.
   *
   * @param slide - The zero-based slide index.
   */
  hold: (slide: number) => () => void;

  /**
   * The slides among `slides` that have holds now.
   *
   * @param slides - Zero-based slide indexes.
   */
  heldSlides: (slides: readonly number[]) => number[];

  /**
   * Resolves once none of `slides` has a hold; at once when none has one now. When `signal` aborts
   * first, the waiter is removed and the promise resolves, so an expired wait leaves nothing
   * behind.
   *
   * @param slides - Zero-based slide indexes.
   * @param signal - Cancels the wait.
   */
  whenReleased: (slides: readonly number[], signal?: AbortSignal) => Promise<void>;

  /**
   * Calls `listener` after every hold and release; returns the unsubscribe function. Slides use it
   * to tell the deck when their step count becomes final.
   */
  subscribe: (listener: () => void) => () => void;
};

/**
 * A pending {@link ReadinessRegistry.whenReleased} call.
 */
type Waiter = {
  /**
   * The slides it waits for.
   */
  slides: readonly number[];

  /**
   * Resolves its promise.
   */
  resolve: () => void;
};

/**
 * Creates a registry with no holds.
 *
 * @returns The registry.
 */
export function createReadinessRegistry(): ReadinessRegistry {
  const holds = new Map<number, number>();
  const waiters = new Set<Waiter>();
  const listeners = new Set<() => void>();

  /**
   * Tells the listeners the holds changed.
   */
  const notify = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };

  /**
   * The slides among `slides` that have holds now.
   *
   * @param slides - Zero-based slide indexes.
   */
  const heldSlides = (slides: readonly number[]): number[] =>
    slides.filter((slide) => (holds.get(slide) ?? 0) > 0);

  /**
   * Resolves the waiters whose slides have no holds left.
   */
  const settle = (): void => {
    for (const waiter of waiters) {
      if (heldSlides(waiter.slides).length === 0) {
        waiters.delete(waiter);
        waiter.resolve();
      }
    }
  };

  return {
    hold: (slide) => {
      holds.set(slide, (holds.get(slide) ?? 0) + 1);
      notify();
      let held = true;
      return () => {
        if (!held) {
          return;
        }

        held = false;
        const remaining = (holds.get(slide) ?? 1) - 1;
        if (remaining === 0) {
          holds.delete(slide);
        } else {
          holds.set(slide, remaining);
        }

        settle();
        notify();
      };
    },
    heldSlides,
    whenReleased: (slides, signal) => {
      if (heldSlides(slides).length === 0 || signal?.aborted === true) {
        return Promise.resolve();
      }

      return new Promise((resolve) => {
        const waiter: Waiter = { slides, resolve };
        waiters.add(waiter);
        signal?.addEventListener(
          'abort',
          () => {
            waiters.delete(waiter);
            resolve();
          },
          { once: true },
        );
      });
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
