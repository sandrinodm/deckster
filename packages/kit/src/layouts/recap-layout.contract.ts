import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import {
  CHROME_HINT,
  chromeField,
  CONTEXT_MAX_WORDS,
  EYEBROW_HINT,
  EyebrowField,
  REVEAL_HINT,
  RevealField,
  textField,
} from '#layout-fields.ts';

/**
 * The fewest takeaways on a recap slide.
 */
export const MIN_RECAP_POINTS = 2;

/**
 * The most takeaways a recap holds before the audience needs a second slide.
 */
export const MAX_RECAP_POINTS = 4;

/**
 * The longest takeaway sentence, in characters.
 */
export const RECAP_POINT_MAX_CHARS = 76;

/**
 * The longest optional detail under a takeaway, in characters.
 */
export const RECAP_DETAIL_MAX_CHARS = 90;

/**
 * The longest takeaway sentence with three points, in characters.
 */
export const RECAP_POINT_MAX_CHARS_IN_THREE = 54;

/**
 * The longest takeaway sentence with four points, in characters.
 */
export const RECAP_POINT_MAX_CHARS_IN_FOUR = 50;

/**
 * The longest detail with four points, in characters.
 */
export const RECAP_DETAIL_MAX_CHARS_IN_FOUR = 60;

/**
 * The longest slide title, in characters, kept on one line to leave room for four rows.
 */
export const RECAP_TITLE_MAX_CHARS = 50;

/**
 * The most words in the bottom source or caveat.
 */
const RECAP_FOOTNOTE_MAX_WORDS = 16;

/**
 * A takeaway sentence and an optional supporting line.
 */
const RecapPoint = Schema.Struct({
  title: textField(RECAP_POINT_MAX_CHARS, 'a takeaway sentence'),
  detail: Schema.optionalKey(textField(RECAP_DETAIL_MAX_CHARS, 'a takeaway detail')),
});

/**
 * One decoded takeaway from a slide's points field.
 */
export type RecapPointEntry = typeof RecapPoint.Type;

/**
 * The contract of the recap layout: two to four numbered takeaways at the end of a part or talk.
 */
export const recapLayoutContract = defineLayoutContract({
  name: 'recap',
  description:
    'Two to four takeaways under a title that states the point, from `points:` in the ' +
    'frontmatter. Each is a large numeral beside one sentence (`title`) and an optional ' +
    'second line of `detail`, set directly on the slide without cards or icons. The numbers ' +
    'are recall cues, not stages of a process. Use it at the end of a part or the talk to ' +
    'leave the audience with the few things to remember. `reveal: true` brings in one point ' +
    'per click. Use cards for parallel ideas that need icons and bodies, steps for actions ' +
    'that happen in order, agenda for the parts still to come, a statement for a single ' +
    'takeaway, and closing for the final ask and contact details.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    points: Schema.Array(RecapPoint).check(
      Schema.isMinLength(MIN_RECAP_POINTS, {
        message: `Expected at least ${MIN_RECAP_POINTS} points`,
      }),
      Schema.isMaxLength(MAX_RECAP_POINTS, {
        message: `Expected at most ${MAX_RECAP_POINTS} points`,
      }),
    ),
    reveal: RevealField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    points:
      `List ${MIN_RECAP_POINTS} to ${MAX_RECAP_POINTS} takeaways, each with \`title\` (one ` +
      `sentence, up to ${RECAP_POINT_MAX_CHARS} characters, ${RECAP_POINT_MAX_CHARS_IN_THREE} ` +
      `with three points, ${RECAP_POINT_MAX_CHARS_IN_FOUR} with four points) and optional ` +
      `\`detail\` (up to ${RECAP_DETAIL_MAX_CHARS} characters, ` +
      `${RECAP_DETAIL_MAX_CHARS_IN_FOUR} with four points). Numbers are supplied automatically.`,
    reveal: REVEAL_HINT,
    chrome: CHROME_HINT,
  },
  title: { required: true, maxChars: RECAP_TITLE_MAX_CHARS },
  slots: {
    body: {
      description: 'One sentence framing what to remember. Put the takeaways in `points:`.',
      accepts: ['text'],
    },
    footnote: {
      description: 'A source or caveat on the bottom line.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: CONTEXT_MAX_WORDS },
    footnote: { maxWords: RECAP_FOOTNOTE_MAX_WORDS },
  },
  variants: [
    {
      name: 'three takeaways',
      when: { counts: { points: 3 } },
      budget: {},
      fields: {
        'points[].title': { maxChars: RECAP_POINT_MAX_CHARS_IN_THREE },
      },
    },
    {
      name: 'four takeaways',
      when: { counts: { points: MAX_RECAP_POINTS } },
      budget: {},
      fields: {
        'points[].title': { maxChars: RECAP_POINT_MAX_CHARS_IN_FOUR },
        'points[].detail': { maxChars: RECAP_DETAIL_MAX_CHARS_IN_FOUR },
      },
    },
  ],
  pptx: {
    type: 'title-only',
    placeholders: [
      { kind: 'title', from: { selector: '.kit-title' } },
      { kind: 'body', from: { slot: 'body' } },
    ],
  },
  example: {
    frontmatter: {
      title: 'Shade needs care as much as planting',
      eyebrow: 'What to remember',
      points: [
        {
          title: 'Plant the hottest blocks first.',
          detail: 'Rank streets by summer surface heat.',
        },
        {
          title: 'Give every tree room to grow.',
          detail: 'Connect soil cells under the pavement.',
        },
        {
          title: 'Fund three summers of care.',
          detail: 'Water, mulch and inspect every new tree.',
        },
      ],
    },
    body: [
      'These are the three commitments behind the canopy programme.',
      '',
      '<Notes>',
      'Return to the three commitments before asking the board for next season’s funding.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
