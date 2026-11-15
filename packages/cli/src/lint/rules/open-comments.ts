import type { DeckRule } from '#lint/types.ts';

import { count } from '#lint/format-report.ts';

/**
 * Slides with open review comments, one warning per slide with its count. Comments are left in the
 * dev server's comment mode or with `deck comments add`; a deck with open feedback still builds, so
 * this is a reminder, not an error.
 */
export const openCommentsRule: DeckRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'open-comments',

  /**
   * A deck rule.
   */
  kind: 'deck',

  /**
   * Open feedback does not fail the deck.
   */
  severity: 'warning',

  /**
   * The sentence `deck lint --help` lists for the rule.
   */
  description: 'A slide has open review comments in .feedback/.',

  /**
   * One violation per slide of the deck with open comments, in slide order.
   */
  check: ({ deck }) =>
    deck.slides.flatMap((slide) => {
      const open = Object.hasOwn(deck.openComments, slide.id)
        ? (deck.openComments[slide.id] ?? 0)
        : 0;
      if (open === 0) {
        return [];
      }

      return [
        {
          slide: slide.id,
          message: `${count(open, 'open review comment')} on this slide.`,
          fix:
            `Run \`pnpm deck comments ${deck.id} --slide ${slide.id}\`, ` +
            'make the changes they ask for, ' +
            `then \`pnpm deck comments resolve ${deck.id} <id>\`.`,
          selector: null,
          key: `open-comments:${slide.id}`,
        },
      ];
    }),
};
