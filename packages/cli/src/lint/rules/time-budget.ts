import type { DeckRule } from '#lint/types.ts';

import { count } from '#lint/format-report.ts';

/**
 * Seconds per minute, for messages.
 */
const SECONDS_PER_MINUTE = 60;

/**
 * The slides' speaking budgets (`budget:` frontmatter) adding up to more than the time the talk
 * has. The talk's length is the deck config's `duration`; without one the rule reports nothing.
 */
export const timeBudgetRule: DeckRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'time-budget',

  /**
   * A deck rule.
   */
  kind: 'deck',

  /**
   * A talk that does not fit its slot fails the deck.
   */
  severity: 'error',

  /**
   * The sentence `deck lint --help` lists for the rule.
   */
  description:
    "The slides' budgets add up to more than the talk's duration (the deck config's `duration`).",

  /**
   * Compares the total of the slide budgets with the deck's duration.
   */
  check: ({ deck }) => {
    const duration = deck.durationSeconds;
    const budgets = deck.slides.map((slide) => slide.budgetSeconds ?? 0);
    const total = budgets.reduce((sum, seconds) => sum + seconds, 0);
    if (duration === undefined || total <= duration) {
      return [];
    }

    const unbudgeted = deck.slides.filter((slide) => slide.budgetSeconds === undefined).length;
    const verb = unbudgeted === 1 ? 'has' : 'have';
    const unbudgetedNote =
      unbudgeted === 0 ? '' : ` (${count(unbudgeted, 'slide')} ${verb} no budget, so it is more)`;
    return [
      {
        slide: null,
        message:
          `The slides' budgets add up to ${clock(total)}${unbudgetedNote}; ` +
          `the talk has ${clock(duration)}.`,
        fix: 'Cut slides, shorten their budgets, or move detail into an appendix.',
        selector: null,
      },
    ];
  },
};

/**
 * Seconds as `m:ss`.
 *
 * @param seconds - A duration.
 */
function clock(seconds: number): string {
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  return `${minutes}:${String(seconds % SECONDS_PER_MINUTE).padStart(2, '0')}`;
}
