import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import {
  CHROME_HINT,
  chromeField,
  currentProblems,
  EYEBROW_HINT,
  EyebrowField,
  textField,
} from '#layouts/layout-fields.ts';

/**
 * The fewest items an agenda lists.
 */
export const MIN_AGENDA_ITEMS = 3;

/**
 * The most items an agenda lists; a longer talk groups its parts.
 */
export const MAX_AGENDA_ITEMS = 7;

/**
 * The longest item title, in characters: one line in eight columns at the item step.
 */
export const AGENDA_ITEM_MAX_CHARS = 40;

/**
 * The longest item detail, in characters: two lines in the four-column detail column.
 */
export const AGENDA_DETAIL_MAX_CHARS = 44;

/**
 * The longest item detail in an agenda of five to seven, in characters: one line beside the title.
 */
export const AGENDA_DETAIL_MAX_CHARS_DENSE = 32;

/**
 * The longest item title in an agenda of five to seven, in characters: one line in six columns.
 */
export const AGENDA_ITEM_MAX_CHARS_DENSE = 36;

/**
 * The longest time or duration, in characters: `10 min` or `09:30`, in the last column.
 */
export const AGENDA_TIME_MAX_CHARS = 7;

/**
 * The longest agenda title, in characters: one line, so seven items fit under it.
 */
export const AGENDA_TITLE_MAX_CHARS = 48;

/**
 * One part of the talk: what it is called, a line on what it covers, and when or how long.
 */
const AgendaItem = Schema.Struct({
  title: textField(AGENDA_ITEM_MAX_CHARS, 'an item title'),
  detail: Schema.optionalKey(textField(AGENDA_DETAIL_MAX_CHARS, 'an item detail')),
  time: Schema.optionalKey(textField(AGENDA_TIME_MAX_CHARS, 'a time')),
});

/**
 * One agenda item as a slide's frontmatter writes it, decoded.
 */
export type AgendaItem = typeof AgendaItem.Type;

/**
 * The contract of the `agenda` layout: the parts of the talk, with the one we are in marked.
 */
export const agendaLayoutContract = defineLayoutContract({
  name: 'agenda',
  description:
    'The parts of the talk as a numbered list of three to seven items, each with an optional ' +
    'line of detail and a time or duration. Show it once after the cover, and again between ' +
    'parts with `current:` set to the part that starts (1 is the first): that item is marked ' +
    'and the ones before it fade, so the room sees where they are. Use it for the plan of the ' +
    'talk, not for points of an argument (content) or a process (steps); more than seven parts ' +
    'need grouping.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    items: Schema.Array(AgendaItem).check(
      Schema.isMinLength(MIN_AGENDA_ITEMS, {
        message: `Expected at least ${MIN_AGENDA_ITEMS} agenda items`,
      }),
      Schema.isMaxLength(MAX_AGENDA_ITEMS, {
        message: `Expected at most ${MAX_AGENDA_ITEMS} agenda items`,
      }),
    ),
    current: Schema.optionalKey(
      Schema.Int.check(
        Schema.isBetween(
          { minimum: 1, maximum: MAX_AGENDA_ITEMS },
          { message: `Expected the number of an item, from 1 to ${MAX_AGENDA_ITEMS}` },
        ),
      ),
    ),
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    items:
      `List ${MIN_AGENDA_ITEMS} to ${MAX_AGENDA_ITEMS} items in order, each with \`title\` ` +
      `(up to ${AGENDA_ITEM_MAX_CHARS} characters, ${AGENDA_ITEM_MAX_CHARS_DENSE} in an agenda ` +
      'of five to seven) and optionally `detail` (up to ' +
      `${AGENDA_DETAIL_MAX_CHARS}, ${AGENDA_DETAIL_MAX_CHARS_DENSE} in an agenda of five to ` +
      `seven) and \`time\` ("10 min", "09:30", up to ${AGENDA_TIME_MAX_CHARS}).`,
    current:
      'Write the number of the part that starts now, `current: 2` for the second item, on an ' +
      'agenda shown between parts; leave it out on the first agenda.',
    chrome: CHROME_HINT,
  },
  checks: (frontmatter) => currentProblems(frontmatter, frontmatter.items, 'item'),
  title: { required: true, maxChars: AGENDA_TITLE_MAX_CHARS },
  slots: {
    footnote: {
      description: 'A practical note on the bottom line: breaks, where the slides are.',
      accepts: ['text'],
    },
  },
  budget: {
    footnote: { maxWords: 18 },
  },
  variants: [
    // Five to seven rows set the detail beside the title: one line each.
    {
      name: '5 to 7 items',
      when: { counts: { items: { min: 5, max: MAX_AGENDA_ITEMS } } },
      budget: {},
      fields: {
        'items[].title': { maxChars: AGENDA_ITEM_MAX_CHARS_DENSE },
        'items[].detail': { maxChars: AGENDA_DETAIL_MAX_CHARS_DENSE },
      },
    },
  ],
  pptx: {
    type: 'content',
    placeholders: [
      { kind: 'title', from: { selector: '.kit-title' } },
      { kind: 'body', from: { selector: '.kit-agenda' } },
    ],
  },
  example: {
    frontmatter: {
      title: 'Four questions for the committee',
      eyebrow: 'Agenda',
      items: [
        {
          title: 'Why Eastgate',
          detail: 'Where the heat lands and who it lands on',
          time: '5 min',
        },
        {
          title: 'What the pilot showed',
          detail: 'Three summers on Holloway Road',
          time: '8 min',
        },
        { title: 'The plan', detail: 'Ten years, hottest blocks first', time: '5 min' },
        { title: 'The ask', detail: 'A capital line and three posts', time: '2 min' },
      ],
    },
    body: [
      '<Notes>',
      'Name the four parts, then say the ask comes last and takes two minutes.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
