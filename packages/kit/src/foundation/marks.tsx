import type { ReactNode } from 'react';

import '#foundation/marks.css';

/**
 * The kit's judgement silhouettes, all drawn on the same grid and stroke.
 */
const MARK_PATHS = {
  /**
   * Inclusion, a correct answer or an encouraged behaviour.
   */
  check: 'M5 12.5l4.5 4.5L19 7.5',

  /**
   * A behaviour to avoid.
   */
  cross: 'M6 6l12 12M18 6 6 18',

  /**
   * A state that needs attention.
   */
  triangle: 'M12 3 22 21H2Z',

  /**
   * A blocked state.
   */
  square: 'M4 4h16v16H4Z',

  /**
   * The priority item in a register.
   */
  diamond: 'M12 2 22 12 12 22 2 12Z',
} as const;

/**
 * A cap-height judgement mark. Adjacent words carry its meaning unless a translated heading needs
 * an explicit accessible label; marks never select their own semantic colour.
 */
export function KitMark({
  kind,
  className = '',
  label,
}: {
  kind: keyof typeof MARK_PATHS;
  className?: string;
  label?: string;
}): ReactNode {
  return (
    <svg
      className={`kit-mark ${className}`}
      viewBox="0 0 24 24"
      role={label === undefined ? undefined : 'img'}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
      focusable="false"
      data-decorative={label === undefined ? '' : undefined}>
      <path d={MARK_PATHS[kind]} />
    </svg>
  );
}

/**
 * A cap-height level meter whose unfilled bars use the surface's muted fill. The caller supplies
 * the level as adjacent text, so this mark is decorative.
 */
export function KitMeter({ filled }: { filled: number }): ReactNode {
  return (
    <span className="kit-meter" aria-hidden="true" data-decorative="">
      {[1, 2, 3].map((mark) => (
        <span key={mark} data-filled={String(mark <= filled)} />
      ))}
    </span>
  );
}
