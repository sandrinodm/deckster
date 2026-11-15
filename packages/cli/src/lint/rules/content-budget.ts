import type { ContentBudget } from '@deckster/engine/layout';

import { matchingVariants, slideBudget } from '@deckster/engine/layout';

import type { SlideRule, SlotSnapshot } from '#lint/types.ts';

/**
 * The limits of a content budget, each with the slot count it bounds and how to name it.
 */
const LIMITS = [
  { limit: 'maxWords', count: 'words', noun: 'words' },
  { limit: 'maxBullets', count: 'bullets', noun: 'bullets' },
  { limit: 'maxLines', count: 'lines', noun: 'lines' },
] as const satisfies readonly {
  limit: keyof ContentBudget;
  count: keyof Omit<SlotSnapshot, 'name'>;
  noun: string;
}[];

/**
 * A slot that holds more than its layout's content budget allows: more words, bullets or lines of
 * code than the layout was designed for. The budgets come from the layout's contract (`deck layouts
 * --json` prints them), tightened by every variant the slide matches, such as a narrower text
 * column. They count content, which is the same in every brand, never the room it takes, so a slide
 * within budget in one brand is within it in all of them; whether it fits the brand's type is for
 * the overflow rules. Slots are counted over all their content, hidden steps included, so the rule
 * runs once per slide.
 */
export const contentBudgetRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'content-budget',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * Slot counts do not change with the step.
   */
  scope: 'slide',

  /**
   * Going over a layout's budget fails the deck: the layout only looks right within it.
   */
  severity: 'error',

  /**
   * The sentence `deck lint --help` lists for the rule.
   */
  description: "A layout slot holds more words, bullets or lines of code than the layout's budget.",

  /**
   * Reports each limit each slot goes over.
   */
  check: ({ snapshot, slide, layout }) => {
    if (layout === undefined) {
      return [];
    }

    const input = {
      frontmatter: slide.frontmatter,
      filled: snapshot.slots.map((slot) => slot.name),
    };
    const variants = matchingVariants(layout, input).map((variant) => variant.name);
    const where = variants.length === 0 ? '' : ` (${variants.join('; ')})`;
    return snapshot.slots.flatMap((slot) => {
      const budget: ContentBudget = slideBudget(layout, slot.name, input);
      return LIMITS.flatMap(({ limit, count, noun }) => {
        const max = budget[limit];
        if (max === undefined || slot[count] <= max) {
          return [];
        }

        return [
          {
            message:
              `The ${slot.name} slot holds ${slot[count]} ${noun}; ` +
              `its layout allows ${max}${where}.`,
            fix:
              'Cut it to the essentials, split the slide, move detail into speaker notes, or ' +
              'pick a layout made for more content (`pnpm deck layouts`).',
            selector: `[data-slot="${slot.name}"] (${limit})`,
          },
        ];
      });
    });
  },
};
