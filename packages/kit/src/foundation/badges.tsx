import type { ReactNode } from 'react';

import '#foundation/badges.css';

/**
 * A filled accent marker for the selected item, never smaller than the brand's label step.
 */
export function Badge({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}): ReactNode {
  return <span className={`kit-badge kit-type-label ${className}`}>{children}</span>;
}

/**
 * An outlined state label. Good and bad states use semantic tones; neutral states use foreground.
 */
export function Pill({
  children,
  tone = 'neutral',
  exception = false,
  className = '',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'positive' | 'negative' | 'muted';
  exception?: boolean;
  className?: string;
}): ReactNode {
  return (
    <span
      className={`kit-pill kit-type-label ${className}`}
      data-tone={tone}
      data-exception={exception || undefined}>
      {children}
    </span>
  );
}
