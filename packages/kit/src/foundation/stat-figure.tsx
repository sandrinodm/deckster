import type { ReactNode } from 'react';

import type { DeltaDirection, DeltaTone } from '#layouts/stat-value.ts';

import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { deltaDirection, deltaText, deltaTone, splitStat } from '#layouts/stat-value.ts';

/**
 * What a stat's delta needs: the text, and the tone and trend the slide may set.
 */
type StatDeltaEntry = {
  /**
   * The delta as written, such as `+12% since 2023`.
   */
  delta?: string | undefined;

  /**
   * Whether the change is good, bad or neither; from the sign when left out.
   */
  tone?: DeltaTone | undefined;

  /**
   * Which way it points, for a delta without a sign.
   */
  trend?: DeltaDirection | undefined;
};

/**
 * Props of {@link StatValue}.
 */
type StatValueProps = {
  /**
   * The value as the slide writes it.
   */
  value: string | number;

  /**
   * Extra classes, such as a size for the figure.
   */
  className?: string;
};

/**
 * A stat's figure in the brand's stat style with tabular numerals, its unit text set smaller.
 */
export function StatValue({ value, className }: StatValueProps): ReactNode {
  const { prefix, number, suffix, spaced } = splitStat(String(value));
  const extra = className === undefined ? '' : ` ${className}`;
  const classes = `kit-stat-value kit-type-stat kit-numeric${extra}`;
  return (
    <p className={classes}>
      {prefix === '' ? null : (
        <span className="kit-stat-unit" data-side="before">
          {prefix}
        </span>
      )}
      {number}
      {suffix === '' ? null : (
        <span className="kit-stat-unit" data-side="after" data-spaced={spaced}>
          {suffix}
        </span>
      )}
    </p>
  );
}

/**
 * Props of {@link StatDelta}.
 */
type StatDeltaProps = {
  /**
   * The stat whose delta to show.
   */
  stat: StatDeltaEntry;
};

/**
 * A stat's change: an arrow for its direction (its sign, or `trend` for a delta without one) and
 * the text, in the positive, negative or muted color its tone gives it. A stat without a delta
 * keeps the delta row empty, so the row's rules and figures stay level.
 */
export function StatDelta({ stat }: StatDeltaProps): ReactNode {
  if (stat.delta === undefined) {
    return <p className="kit-stat-delta kit-type-caption" aria-hidden="true" />;
  }

  const direction = deltaDirection(stat.delta, stat.trend);
  return (
    <p
      className="kit-stat-delta kit-type-caption kit-numeric"
      data-tone={deltaTone(stat.delta, stat.tone, stat.trend)}>
      {direction === 'flat' ? null : <DeltaArrow direction={direction} />}
      <span>{smartPunctuation(deltaText(stat.delta))}</span>
    </p>
  );
}

/**
 * Props of {@link DeltaArrow}.
 */
type DeltaArrowProps = {
  /**
   * Which way the arrow points.
   */
  direction: 'up' | 'down';
};

/**
 * A small filled triangle pointing up or down, drawn in the text color.
 */
function DeltaArrow({ direction }: DeltaArrowProps): ReactNode {
  const points = direction === 'up' ? '5,1 9.5,9 0.5,9' : '0.5,1 9.5,1 5,9';
  return (
    <svg className="kit-stat-arrow" viewBox="0 0 10 10" aria-hidden="true">
      <polygon points={points} fill="currentColor" />
    </svg>
  );
}
