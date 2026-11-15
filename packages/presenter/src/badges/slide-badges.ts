import { createStore, useStore } from '#state/store.ts';

/**
 * A small label on a slide's thumbnail in the sidebar and the overview, such as the number of open
 * comments.
 */
export type SlideBadge = {
  /**
   * The short text shown in the badge, such as `3`.
   */
  label: string;

  /**
   * What the badge means, shown as a tooltip and read by screen readers.
   */
  title?: string;

  /**
   * How loud the badge is: `neutral` (default), `accent` for something that needs attention.
   */
  tone?: 'neutral' | 'accent';
};

/**
 * Each plugin's badges: its name, then slide id to badges.
 */
type BadgeSources = ReadonlyMap<string, Readonly<Record<string, readonly SlideBadge[]>>>;

/**
 * Every source's badges, keyed by source name, so one source changing leaves the others alone.
 */
const sources = createStore<BadgeSources>(new Map());

/**
 * Sets every badge one source shows, replacing what that source set before. Call it again whenever
 * the badges change; the sidebar and the overview update at once.
 *
 * @param source - A name unique to the calling plugin, such as `comments`.
 * @param badges - Badges by slide id; slides that are not listed have none from this source.
 */
export function setSlideBadges(
  source: string,
  badges: Readonly<Record<string, readonly SlideBadge[]>>,
): void {
  const next = new Map(sources.get());
  next.set(source, badges);
  sources.set(next);
}

/**
 * Removes every badge one source set.
 *
 * @param source - The name given to {@link setSlideBadges}.
 */
export function clearSlideBadges(source: string): void {
  const next = new Map(sources.get());
  next.delete(source);
  sources.set(next);
}

/**
 * The badges every source shows for a slide, in the order the sources were first set.
 *
 * @param all - A snapshot from {@link useBadgeSources}.
 * @param slideId - The slide id.
 */
export function badgesFor(all: BadgeSources, slideId: string): readonly SlideBadge[] {
  return [...all.values()].flatMap((bySlide) => bySlide[slideId] ?? []);
}

/**
 * The badges every source currently shows for a slide.
 *
 * @param slideId - The slide id.
 */
export function currentBadges(slideId: string): readonly SlideBadge[] {
  return badgesFor(sources.get(), slideId);
}

/**
 * Reads every badge source in a component and re-renders when one changes.
 */
export function useBadgeSources(): BadgeSources {
  return useStore(sources);
}
