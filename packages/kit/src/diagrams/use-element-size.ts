import { useLayoutEffect, useState, type RefObject } from 'react';

import { EPSILON } from '#diagrams/geometry.ts';

/**
 * An element's layout size in canvas pixels.
 */
export type ElementSize = {
  /**
   * The inner width.
   */
  width: number;

  /**
   * The inner height.
   */
  height: number;
};

/**
 * Tracks an element's inner size (`clientWidth` and `clientHeight`, layout geometry that the deck's
 * scaling does not change) and updates when it changes.
 *
 * @param ref - The element.
 * @returns The size; `undefined` until the element has been measured or while it has no size.
 */
export function useElementSize(ref: RefObject<HTMLElement | null>): ElementSize | undefined {
  const [size, setSize] = useState<ElementSize>();
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) {
      return undefined;
    }

    /**
     * Reads the element's size, keeping the old value when it has not changed.
     */
    const measure = (): void => {
      const next = { width: element.clientWidth, height: element.clientHeight };
      setSize((previous) =>
        previous !== undefined && isSameSize(previous, next) ? previous : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size !== undefined && size.width > 0 && size.height > 0 ? size : undefined;
}

/**
 * Whether two sizes agree within {@link EPSILON} on both sides, so a sub-pixel change keeps the size
 * the hook already has.
 *
 * @param left - A size.
 * @param right - Another.
 */
function isSameSize(left: ElementSize, right: ElementSize): boolean {
  return (
    Math.abs(left.width - right.width) < EPSILON && Math.abs(left.height - right.height) < EPSILON
  );
}
