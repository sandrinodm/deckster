import type { ReactNode } from 'react';

/**
 * Props of {@link CountingNumber}.
 */
type CountingNumberProps = {
  /**
   * The final value, which keeps its place in the layout.
   */
  number: string;

  /**
   * The value the count shows now.
   */
  counting: string;

  /**
   * Which edge the counting value keeps to: the end, beside a unit after the number, or the start,
   * beside a currency sign before a number with no unit after it.
   */
  align: 'start' | 'end';
};

/**
 * A number while it counts up: the final value stays in the line, invisible but still the text
 * assistive technology reads, and the counting value is drawn over it in the same cell, hidden from
 * assistive technology. The final value sizes the cell, so the line, the fitted figure size and the
 * units beside it never move.
 */
export function CountingNumber({ number, counting, align }: CountingNumberProps): ReactNode {
  return (
    <span className="kit-count" data-align={align}>
      <span className="kit-count-final">{number}</span>
      <span className="kit-count-live" aria-hidden="true">
        {counting}
      </span>
    </span>
  );
}
