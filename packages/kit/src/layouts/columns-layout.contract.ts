import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import {
  CHROME_HINT,
  chromeField,
  currentProblems,
  EYEBROW_HINT,
  EyebrowField,
  RevealField,
  textField,
} from '#layout-fields.ts';

/**
 * The fewest columns a board shows: two lanes, such as now and next.
 */
export const MIN_COLUMNS = 2;

/**
 * The most columns a board shows; more lanes belong in a table or on two slides.
 */
export const MAX_COLUMNS = 4;

/**
 * The fewest items in one column.
 */
export const MIN_COLUMN_ITEMS = 1;

/**
 * The most items in one column: four rows of the board.
 */
export const MAX_COLUMN_ITEMS = 4;

/**
 * The longest column heading, in characters: two lines in a third of the row.
 */
export const COLUMN_TITLE_MAX_CHARS = 24;

/**
 * The longest column heading on a board of four, in characters: one line in a quarter of the row,
 * so a full board keeps its height for the items.
 */
export const COLUMN_TITLE_MAX_CHARS_IN_FOUR = 16;

/**
 * The longest tag at the head of a column, in characters: `Q1 2027`, `In progress`, `Funded`.
 */
export const COLUMN_NOTE_MAX_CHARS = 16;

/**
 * The longest tag on a board of four, in characters: one line beside the count in a quarter of the
 * row.
 */
export const COLUMN_NOTE_MAX_CHARS_IN_FOUR = 12;

/**
 * The longest item, in characters: two lines in a third of the row.
 */
export const COLUMN_ITEM_MAX_CHARS = 48;

/**
 * The longest item on a board of four, in characters: three lines in a quarter of the row.
 */
export const COLUMN_ITEM_MAX_CHARS_IN_FOUR = 40;

/**
 * The longest board title, in characters: two lines at the smallest fit step.
 */
export const COLUMNS_TITLE_MAX_CHARS = 60;

/**
 * The most words of the source or caveat on the bottom line.
 */
const COLUMNS_FOOTNOTE_MAX_WORDS = 24;

/**
 * One column of the board: a heading, an optional tag, and its items in order.
 */
const Column = Schema.Struct({
  title: textField(COLUMN_TITLE_MAX_CHARS, 'a column title'),
  note: Schema.optionalKey(textField(COLUMN_NOTE_MAX_CHARS, 'a column note')),
  items: Schema.Array(textField(COLUMN_ITEM_MAX_CHARS, 'a column item')).check(
    Schema.isMinLength(MIN_COLUMN_ITEMS, {
      message: `Expected at least ${MIN_COLUMN_ITEMS} item in a column`,
    }),
    Schema.isMaxLength(MAX_COLUMN_ITEMS, {
      message: `Expected at most ${MAX_COLUMN_ITEMS} items in a column`,
    }),
  ),
});

/**
 * One column as a slide's frontmatter writes it, decoded.
 */
export type ColumnEntry = typeof Column.Type;

/**
 * The contract of the `columns` layout: two to four headed columns of short items, such as a
 * roadmap of now, next and later.
 */
export const columnsLayoutContract = defineLayoutContract({
  name: 'columns',
  description:
    'Two to four headed columns of short items, set as a board: a roadmap of now, next and ' +
    'later, work by status, or a plan in three parts. Each column, from `columns:`, has a ' +
    '`title`, an optional `note` (a short tag such as a quarter or a status) and one to four ' +
    '`items` of a line or two; the items line up across the columns in even rows. `current:` ' +
    'lights the column that matters now on the accent surface while the others stay quiet, and ' +
    '`reveal: true` brings the columns in one per step. Use it when each group holds several ' +
    'short items; use cards when each idea is one card with a line of text, steps when the ' +
    'groups are stages of one process, timeline when they have dates, and comparison when ' +
    'options are measured on the same rows; ' +
    'use quadrants for four boxes, status for readiness, actions for owners and deadlines, or schedule for durations.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    columns: Schema.Array(Column).check(
      Schema.isMinLength(MIN_COLUMNS, { message: `Expected at least ${MIN_COLUMNS} columns` }),
      Schema.isMaxLength(MAX_COLUMNS, { message: `Expected at most ${MAX_COLUMNS} columns` }),
    ),
    current: Schema.optionalKey(
      Schema.Int.check(
        Schema.isBetween(
          { minimum: 1, maximum: MAX_COLUMNS },
          { message: `Expected the number of a column, from 1 to ${MAX_COLUMNS}` },
        ),
      ),
    ),
    reveal: RevealField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    columns:
      `List ${MIN_COLUMNS} to ${MAX_COLUMNS} columns, each with \`title\` (up to ` +
      `${COLUMN_TITLE_MAX_CHARS} characters, ${COLUMN_TITLE_MAX_CHARS_IN_FOUR} with four ` +
      `columns), optionally \`note\` (a tag of up to ${COLUMN_NOTE_MAX_CHARS}, ` +
      `${COLUMN_NOTE_MAX_CHARS_IN_FOUR} with four: "Q1 2027", "Funded") and \`items\`: ` +
      `${MIN_COLUMN_ITEMS} to ${MAX_COLUMN_ITEMS} short lines of up to ${COLUMN_ITEM_MAX_CHARS} ` +
      `characters (${COLUMN_ITEM_MAX_CHARS_IN_FOUR} with four columns), in order.`,
    current:
      'Write the number of the column that matters now, `current: 1` for the first, to set it ' +
      'on the accent surface, or leave it out.',
    reveal:
      'Write `reveal: true` to show the columns one per step, in order, or leave it out to show ' +
      'them all at once.',
    chrome: CHROME_HINT,
  },
  checks: (frontmatter) => currentProblems(frontmatter, frontmatter.columns, 'column'),
  title: { required: true, maxChars: COLUMNS_TITLE_MAX_CHARS },
  // No line of context under the title: a full board needs the height, and the title says what it
  // shows.
  slots: {
    footnote: {
      description: 'A source or caveat on the bottom line.',
      accepts: ['text'],
    },
  },
  budget: {
    footnote: { maxWords: COLUMNS_FOOTNOTE_MAX_WORDS },
  },
  variants: [
    {
      name: 'four columns',
      when: { counts: { columns: MAX_COLUMNS } },
      budget: {},
      // A quarter of the row leaves each heading, tag and item fewer characters a line.
      fields: {
        'columns[].title': { maxChars: COLUMN_TITLE_MAX_CHARS_IN_FOUR },
        'columns[].note': { maxChars: COLUMN_NOTE_MAX_CHARS_IN_FOUR },
        'columns[].items[]': { maxChars: COLUMN_ITEM_MAX_CHARS_IN_FOUR },
      },
    },
  ],
  pptx: {
    type: 'title-only',
    placeholders: [{ kind: 'title', from: { selector: '.kit-title' } }],
  },
  example: {
    frontmatter: {
      title: 'Next year we move from planting to keeping',
      eyebrow: 'Roadmap 2027',
      current: 1,
      columns: [
        {
          title: 'Now',
          note: 'Q1 2027',
          items: ['Plant the last 300 trees on the east side', 'Hire two more arborists'],
        },
        {
          title: 'Next',
          note: 'Q2 to Q3',
          items: ['Sign up 400 watering wardens', 'Map every tree in the app'],
        },
        {
          title: 'Later',
          note: '2028',
          items: ['Extend the programme to Northgate'],
        },
      ],
    },
    body: [
      '<Footnote>Every column is funded in the 2027 budget.</Footnote>',
      '',
      '<Notes>',
      'Start with now: the planting finishes in spring. Then next and later, briefly.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
