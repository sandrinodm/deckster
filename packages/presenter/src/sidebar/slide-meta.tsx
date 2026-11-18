import type { SlideSummary } from '@deckster/engine';
import type { ReactNode } from 'react';

import { badgesFor, useBadgeSources } from '#badges/slide-badges.ts';
import { formatDuration } from '#presenter/format-clock.ts';

/**
 * Props of {@link SlideChips}.
 */
type SlideChipsProps = {
  /**
   * The slide.
   */
  slide: SlideSummary;
};

/**
 * The small facts about a slide shown beside its thumbnail: whether it is hidden, the number of
 * steps it reveals, its speaking budget, and the badges other plugins set for it.
 */
export function SlideChips({ slide }: SlideChipsProps): ReactNode {
  const sources = useBadgeSources();
  const badges = badgesFor(sources, slide.id);
  const reveals = slide.stepCount === undefined ? 0 : slide.stepCount - 1;
  return (
    <span className="dp-badges">
      {slide.hidden ? (
        <span className="dp-chip" data-hidden="" title="Hidden: a talk skips this slide">
          Hidden
        </span>
      ) : null}
      {reveals > 0 ? (
        <span className="dp-chip" title={`${reveals} reveals after the slide appears`}>
          {stepsLabel(reveals)}
        </span>
      ) : null}
      {slide.budget === undefined ? null : (
        <span className="dp-chip" title="Speaking budget">
          {formatDuration(slide.budget)}
        </span>
      )}
      {badges.map((badge, index) => (
        <span
          key={`${badge.label}-${index}`}
          className="dp-chip"
          data-tone={badge.tone ?? 'neutral'}
          data-badge=""
          title={badge.title}>
          {badge.label}
        </span>
      ))}
    </span>
  );
}

/**
 * The chip text for a number of reveals.
 *
 * @param reveals - How many steps the slide reveals after it appears.
 */
function stepsLabel(reveals: number): string {
  return reveals === 1 ? '1 step' : `${reveals} steps`;
}
