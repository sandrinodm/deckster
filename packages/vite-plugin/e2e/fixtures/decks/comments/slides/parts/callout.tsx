import type { ReactNode } from 'react';

/**
 * A boxed note: a component from the deck folder, not a slide.
 */
export function Callout({ children }: { children: ReactNode }): ReactNode {
  return (
    <aside className="callout">
      <strong>Note</strong> <span>{children}</span>
    </aside>
  );
}
