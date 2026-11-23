import type { SlideRule } from '#lint/types.ts';

/**
 * A slide without speaker notes, so the presenter has nothing to read from and an agent has no
 * record of what the slide is for.
 */
export const missingNotesRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'missing-notes',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * Notes belong to the slide, not a step.
   */
  scope: 'slide',

  /**
   * A slide without notes still presents.
   */
  severity: 'warning',

  /**
   * The sentence `deckster lint --help` lists for the rule.
   */
  description: 'A slide has no speaker notes.',

  /**
   * Reports the slide when its notes are empty.
   */
  check: ({ slide }) =>
    slide.notes.trim() === ''
      ? [
          {
            message: 'The slide has no speaker notes.',
            fix:
              'Add a `<Notes>` block saying what the slide proves and what to say, in a sentence ' +
              'or two.',
            selector: null,
          },
        ]
      : [],
};
