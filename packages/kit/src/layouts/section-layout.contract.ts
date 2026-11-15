import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import { CHROME_HINT, chromeField, EYEBROW_HINT, EyebrowField } from '#layouts/layout-fields.ts';

/**
 * The longest section number, in characters: `02`, `IV` or `Q3`.
 */
export const SECTION_NUMBER_MAX_CHARS = 3;

/**
 * The longest part title, in characters: two lines of display type at the smallest fit step.
 */
export const SECTION_TITLE_MAX_CHARS = 40;

/**
 * The contract of the `section` layout: a divider that opens a part of the talk.
 */
export const sectionLayoutContract = defineLayoutContract({
  name: 'section',
  description:
    'A divider that opens a part of the talk: its number set large at the top, the part title ' +
    'on the bottom line and an optional one-sentence summary, whose two lines are kept free ' +
    'when it is left out so every divider sets its title at the same height. Use one per part, ' +
    'in order, all on the same surface. Defaults to the accent surface and hides the page ' +
    'chrome.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    number: Schema.optionalKey(
      Schema.Union([
        Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 99 })),
        Schema.NonEmptyString.check(Schema.isMaxLength(SECTION_NUMBER_MAX_CHARS)),
      ]),
    ),
    chrome: chromeField(false),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    number:
      'Number the part, for example `number: 2` (shown as 02) or `number: IV`, ' +
      `in up to ${SECTION_NUMBER_MAX_CHARS} characters.`,
    chrome: CHROME_HINT,
  },
  title: { required: true, maxChars: SECTION_TITLE_MAX_CHARS },
  slots: {
    body: {
      description:
        'One sentence on what this part covers. Set the part title in `title:` (two to five ' +
        'words).',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: 16 },
  },
  surface: 'accent',
  pptx: {
    type: 'section',
    placeholders: [
      { kind: 'title', from: { selector: '.kit-section-title' } },
      { kind: 'body', from: { slot: 'body' } },
    ],
  },
  example: {
    frontmatter: { title: 'The plan', number: '02', eyebrow: 'Part two' },
    body: [
      'Where we plant, in what order, and what it costs each year.',
      '',
      '<Notes>',
      'Say how long this part takes and what the committee will decide at its end.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
