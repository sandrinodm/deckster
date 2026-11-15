import { useRef, type ReactNode } from 'react';

import { useFitGroupWidth } from '#foundation/fit-text.ts';

/**
 * Selects the figures a group fits together.
 */
const FIGURE_SELECTOR = '.kit-stat-value';

/**
 * Props of {@link FitGroup}.
 */
type FitGroupProps = {
  /**
   * The group's classes.
   */
  className: string;

  /**
   * Data attributes for the group's variant, such as `{ 'data-count': '3' }`.
   */
  variant?: Readonly<Record<`data-${string}`, string | number | boolean | undefined>>;

  /**
   * The figures and their labels.
   */
  children?: ReactNode;
};

/**
 * A group of big figures that share one size, stepped down together until the widest fits its
 * column, as the `stats` layout fits its row; each figure records the outcome in `data-fit`.
 */
export function FitGroup({ className, variant, children }: FitGroupProps): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  useFitGroupWidth(ref, FIGURE_SELECTOR);
  return (
    <div ref={ref} className={className} {...variant}>
      {children}
    </div>
  );
}
