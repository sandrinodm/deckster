import { defineLayoutContract } from '@deckster/engine/layout';
import { Effect, Schema } from 'effect';

import { CHROME_HINT, chromeField, EYEBROW_HINT, EyebrowField } from '#layout-fields.ts';

/**
 * How wide a content slide's body runs: an eight-column reading measure, or all twelve columns for
 * a table, a chart or a component.
 */
export const CONTENT_WIDTHS = ['text', 'full'] as const;

/**
 * One of {@link CONTENT_WIDTHS}.
 */
export type ContentWidth = (typeof CONTENT_WIDTHS)[number];

/**
 * The longest content title, in characters: two lines at the smallest fit step in both brands.
 */
export const CONTENT_TITLE_MAX_CHARS = 90;

/**
 * The contract of the `content` layout: a title and running text.
 */
export const contentLayoutContract = defineLayoutContract({
  name: 'content',
  description:
    'A title that states the point, then a short paragraph, up to six bullets, or a sentence and ' +
    'bullets. Fill <Aside> with a key fact or definition to set it in a column beside the text. ' +
    'Sparse text is set larger and placed in the middle of the space; `width: full` runs the ' +
    'body across all twelve columns for a table, chart or component. The workhorse for ' +
    'explaining one idea; use split when the point needs a picture beside it, and stats when it ' +
    'rests on numbers.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    width: Schema.Literals(CONTENT_WIDTHS).pipe(
      Schema.withDecodingDefaultKey(Effect.succeed<ContentWidth>('text')),
    ),
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    width:
      'Write `width: full` to run the body across all twelve columns (a table, a chart or a ' +
      'component), or leave it out for the eight-column reading measure.',
    chrome: CHROME_HINT,
  },
  title: { required: true, maxChars: CONTENT_TITLE_MAX_CHARS },
  slots: {
    body: {
      description:
        'A paragraph, up to six bullets, or one sentence followed by bullets; with `width: ' +
        'full`, a table, chart or component. Set the takeaway in `title:`. Wrap points in <Step ' +
        'at={n}> to reveal them in turn.',
      required: true,
      accepts: ['text', 'bullets', 'table', 'chart', 'component'],
    },
    aside: {
      description:
        'A key fact, definition or callout beside the body: a short ### heading and a sentence ' +
        'or two.',
      accepts: ['text', 'number'],
    },
    footnote: {
      description: 'A source or caveat on the bottom line, in a sentence or two.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: 72, maxBullets: 6 },
    aside: { maxWords: 36 },
    footnote: { maxWords: 30 },
  },
  variants: [
    {
      name: 'with aside',
      when: { filled: ['aside'] },
      budget: { body: { maxWords: 56 } },
    },
  ],
  pptx: {
    type: 'content',
    placeholders: [
      { kind: 'title', from: { selector: '.kit-title' } },
      { kind: 'body', from: { slot: 'body' } },
    ],
  },
  example: {
    frontmatter: { title: 'Why the heat lands hardest in Eastgate', eyebrow: 'The problem' },
    body: [
      'Three things stack up in the same twelve blocks.',
      '',
      '- Canopy cover is 9%, against 34% in Riverside',
      '- Two in three homes are flats with no cross-ventilation',
      '- Asphalt and flat roofs store heat and release it after dark',
      '',
      '<Aside>',
      '### Canopy cover',
      '',
      'The share of ground that tree crowns shade at noon, measured from summer aerial photos.',
      '</Aside>',
      '',
      '<Footnote>Source: Larkfield summer aerial survey, 2026.</Footnote>',
      '',
      '<Notes>',
      'Name the three causes, then say they all land on the same streets.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
