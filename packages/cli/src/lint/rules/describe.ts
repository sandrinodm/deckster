import type { ElementSnapshot } from '#lint/types.ts';

import { TEXT_EXCERPT_LENGTH } from '#lint/limits.ts';

/**
 * Appended to a text excerpt that was cut short.
 */
const ELLIPSIS = '...';

/**
 * Lengths and ratios in messages keep two decimals.
 */
const HUNDREDTHS = 100;

/**
 * Names an element in a message: its text excerpt in quotes when it has text, else its selector.
 *
 * @param element - The element to name.
 */
export function describeElement(element: ElementSnapshot): string {
  if (element.text === '') {
    return `\`${element.selector}\``;
  }

  const excerpt =
    element.text.length > TEXT_EXCERPT_LENGTH
      ? `${element.text.slice(0, TEXT_EXCERPT_LENGTH)}${ELLIPSIS}`
      : element.text;
  return `"${excerpt}"`;
}

/**
 * A number rounded to two decimals, for messages.
 *
 * @param value - Any number.
 */
export function round(value: number): number {
  return Math.round(value * HUNDREDTHS) / HUNDREDTHS;
}
