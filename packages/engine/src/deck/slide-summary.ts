import type { DeckManifest, SlideMeta } from '#contract/manifest.ts';

import { budgetSeconds } from '#contract/slide-defaults.ts';

/**
 * One slide as tooling sees it through `window.__deck.slides` and `useDeck().slides`.
 */
export type SlideSummary = {
  /**
   * The zero-based position in the deck.
   */
  index: number;

  /**
   * The slide id, its file name without extension.
   */
  id: string;

  /**
   * The slide file relative to the deck folder, such as `slides/title.mdx`.
   */
  file: string;

  /**
   * The frontmatter title, else the first heading (MDX), else the slide id.
   */
  title: string;

  /**
   * The layout the slide's frontmatter names, `default` when it names none.
   */
  layout: string;

  /**
   * Number of steps (step 0 included); `undefined` until the slide has mounted once.
   */
  stepCount: number | undefined;

  /**
   * Speaker notes as written in the slide's `<Notes>` blocks; empty if none.
   */
  notes: string;

  /**
   * The speaking budget from the slide's `budget:` frontmatter, in seconds; `undefined` when the
   * slide has none.
   */
  budget: number | undefined;

  /**
   * The slide's validated frontmatter, with defaults applied: the fields every slide has plus those
   * of its layout. `surface` is absent when the slide uses the default surface.
   */
  frontmatter: SlideMeta['frontmatter'];
};

/**
 * Lists the deck's slides with what the engine knows about their steps.
 *
 * @param manifest - The deck.
 * @param stepCounts - Step count per slide index, `undefined` for slides not mounted yet.
 */
export function summarizeSlides(
  manifest: DeckManifest,
  stepCounts: readonly (number | undefined)[],
): SlideSummary[] {
  return manifest.slides.map((entry, index) => ({
    index,
    id: entry.id,
    file: entry.file,
    title: entry.module.slideMeta.title,
    layout: entry.module.slideMeta.frontmatter.layout,
    stepCount: stepCounts[index],
    notes: entry.module.slideMeta.notes,
    budget: budgetSeconds(entry.module.slideMeta.frontmatter.budget),
    frontmatter: entry.module.slideMeta.frontmatter,
  }));
}

/**
 * Resolves a slide given by zero-based index or by id.
 *
 * @param slideIds - Slide ids in deck order.
 * @param target - A zero-based index or a slide id.
 * @returns The zero-based index.
 * @throws RangeError naming the valid range or ids when `target` matches no slide.
 */
export function resolveSlideIndex(slideIds: readonly string[], target: number | string): number {
  if (typeof target === 'string') {
    const index = slideIds.indexOf(target);
    if (index === -1) {
      throw new RangeError(`No slide with id "${target}". Slide ids: ${slideIds.join(', ')}.`);
    }

    return index;
  }

  if (!Number.isInteger(target) || target < 0 || target >= slideIds.length) {
    throw new RangeError(
      `Slide index ${target} is out of range. Use a zero-based index from 0 to ` +
        `${slideIds.length - 1}, or a slide id.`,
    );
  }

  return target;
}
