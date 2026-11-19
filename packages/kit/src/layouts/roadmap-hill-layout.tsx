import type { CSSProperties, ReactNode } from 'react';

import { defineLayout, type LayoutProps } from '@deckster/engine';

import type { roadmapHillLayoutContract } from '#layouts/roadmap-hill-layout.contract.ts';

import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { patternPosition, PatternSlide, usePatternStage } from '#layouts/pattern-slide.tsx';
import '#layouts/roadmap-hill-layout.css';

/**
 * A complete hill uses the same sampling density as its movement trails.
 */
const HILL_SAMPLES = 36;

/**
 * The first and last horizontal and vertical positions, in percent of the plot.
 */
const HILL_BOUNDS = {
  /**
   * Amount of empty space before the first scope placement.
   */
  left: 6,

  /**
   * Horizontal distance between the start and finish of the hill.
   */
  width: 88,

  /**
   * Height measured from the top down at the baseline.
   */
  base: 78,

  /**
   * The vertical rise from the baseline to the summit.
   */
  height: 58,
};

/**
 * CSS variables used to animate the same geometry that draws the native SVG hill.
 */
type HillStyle = CSSProperties & Record<`--kit-hill-${string}`, number>;

/**
 * Exposes the plotted domain to the animated, accessible HTML markers.
 */
const HILL_STYLE: HillStyle = {
  /**
   * Empty space before the first position.
   */
  '--kit-hill-left': HILL_BOUNDS.left,

  /**
   * Total distance across the curve.
   */
  '--kit-hill-width': HILL_BOUNDS.width,

  /**
   * The baseline position from the top downward.
   */
  '--kit-hill-base': HILL_BOUNDS.base,

  /**
   * Distance from the baseline to the summit.
   */
  '--kit-hill-height': HILL_BOUNDS.height,
};

/**
 * Shows a named scope's current position and connects it to the prior review along the same hill.
 */
function RoadmapHill({
  frontmatter,
  slots,
}: LayoutProps<typeof roadmapHillLayoutContract>): ReactNode {
  const { title, eyebrow, reveal, scopes, previous, current, takeaway } = frontmatter;
  const moved = usePatternStage(reveal, 1) > 0;
  const hill = hillPath(0, 100);
  return (
    <PatternSlide layout="roadmap-hill" eyebrow={eyebrow} title={title} footnote={slots.footnote}>
      <div className="kit-hill-caption kit-type-label" aria-label="Review dates">
        <span>{smartPunctuation(previous)}</span>
        <span className="kit-hill-date" aria-hidden={!moved} data-pattern-visible={moved}>
          → {smartPunctuation(current)}
        </span>
      </div>
      <div className="kit-hill" style={HILL_STYLE}>
        <svg
          className="kit-pattern-plot"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true">
          <path className="kit-hill-fill" d={`${hill}Z`} />
          <path className="kit-hill-curve" d={hill} />
          <line className="kit-hill-summit" x1="50" y1="21" x2="50" y2="79" />
          {scopes.map(({ previous: from, current: to }, index) => (
            <path
              key={index}
              className="kit-hill-trail"
              d={hillPath(from, to)}
              data-pattern-visible={moved}
            />
          ))}
        </svg>
        <p className="kit-hill-apex kit-type-caption">Approach known</p>
        <ol className="kit-hill-scopes" aria-label="Scope positions">
          {scopes.map(({ name, previous: from, current: to }, index) => {
            const before = hillPoint(from);
            const placement = moved ? to : from;
            const position: HillStyle = { '--kit-hill-progress': placement / 100 };
            return (
              <li key={index} className="kit-hill-scope" style={position}>
                <span
                  className="kit-hill-marker kit-hill-before"
                  style={patternPosition(before.x, before.y)}
                  aria-hidden="true"
                  data-pattern-visible={moved}
                />
                <span
                  className="kit-hill-marker kit-hill-now kit-hill-position"
                  aria-hidden="true"
                />
                <span
                  className="kit-hill-name kit-type-small kit-hill-position"
                  data-hill-align={hillLabelAlign(placement)}>
                  {smartPunctuation(name)}
                </span>
                <span className="kit-pattern-sr-only" data-decorative="">
                  {previous}: {hillPhase(from)}.{' '}
                  {moved ? `${current}: ${hillPhase(to)}. ${hillMovement(from, to)}` : ''}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="kit-hill-phases kit-type-label">
          <span>Discover the approach</span>
          <span>Carry it out</span>
        </div>
      </div>
      <p
        className="kit-hill-takeaway kit-type-small"
        aria-hidden={!moved}
        data-pattern-visible={moved}>
        {smartPunctuation(takeaway)}
      </p>
    </PatternSlide>
  );
}

/**
 * Starts or ends edge labels at their marker so the printed scope name stays inside the plot.
 */
function hillLabelAlign(position: number): 'left' | 'center' | 'right' {
  if (position < 12) {
    return 'left';
  }

  if (position > 88) {
    return 'right';
  }

  return 'center';
}

/**
 * Names the qualitative state represented by the placement without exposing author coordinates.
 */
function hillPhase(position: number): string {
  if (position < 50) {
    return 'discovering the approach';
  }

  if (position > 50) {
    return 'carrying out the approach';
  }

  return 'approach known';
}

/**
 * Describes direction between the two reports, including a return to uncertainty or no movement.
 */
function hillMovement(from: number, to: number): string {
  if (to < from) {
    return 'Moved back on the hill.';
  }

  if (to > from) {
    return 'Moved forward on the hill.';
  }

  return 'No movement since the earlier review.';
}

/**
 * Converts a qualitative position between 0 and 100 into a point on the drawn hill.
 */
function hillPoint(where: number): { x: number; y: number } {
  const share = where / 100;
  const rise = Math.sin(share * Math.PI) ** 2;
  return {
    x: HILL_BOUNDS.left + HILL_BOUNDS.width * share,
    y: HILL_BOUNDS.base - HILL_BOUNDS.height * rise,
  };
}

/**
 * Samples the same curve between any two placements, preserving direction when a scope moves back.
 */
function hillPath(from: number, to: number): string {
  return Array.from({ length: HILL_SAMPLES + 1 }, (_, index) => {
    const position = from + (index / HILL_SAMPLES) * (to - from);
    const { x, y } = hillPoint(position);
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join('');
}

/**
 * The two-review uncertainty hill layout.
 */
export const roadmapHillLayout = defineLayout<typeof roadmapHillLayoutContract>({
  name: 'roadmap-hill',
  component: RoadmapHill,
});
