import { useStatic } from '@deckster/engine';

/**
 * The highest entrance order the kit's stylesheet staggers; later orders enter with it.
 */
export const MAX_ENTER_ORDER = 6;

/**
 * The attribute that marks an element for the slide entrance, with its order as the value.
 */
export type EnterProps = {
  /**
   * The element's place in the entrance, 0 first.
   */
  'data-kit-enter'?: number;
};

/**
 * Marks an element to take part in the slide's entrance: when the deck moves forward onto the
 * slide, it fades and rises into place with the brand's emphasized easing, after the elements of
 * lower order. Going back to a slide, opening it from a link and static mode show it in place with
 * no motion. Spread the result onto the element.
 *
 * @param order - The element's place in the entrance, 0 first; values above {@link MAX_ENTER_ORDER}
 *   enter with it, negative values with 0.
 * @returns The attribute to spread, or nothing in static mode.
 */
export function useEnter(order: number): EnterProps {
  return enterProps(order, useStatic());
}

/**
 * The entrance attribute for an element of the given order, for code that marks several elements
 * from one `useStatic()` reading, such as a list rendered in a loop.
 *
 * @param order - The element's place in the entrance, 0 first; clamped to 0 to
 *   {@link MAX_ENTER_ORDER} and rounded.
 * @param isStatic - Whether the deck is in static mode, from `useStatic()`.
 * @returns The attribute to spread, or nothing in static mode.
 */
export function enterProps(order: number, isStatic: boolean): EnterProps {
  if (isStatic) {
    return {};
  }

  return { 'data-kit-enter': Math.min(Math.max(Math.round(order), 0), MAX_ENTER_ORDER) };
}
