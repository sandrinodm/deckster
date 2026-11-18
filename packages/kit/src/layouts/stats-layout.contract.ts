import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import { CHROME_HINT, chromeField, EYEBROW_HINT, EyebrowField } from '#layouts/layout-fields.ts';

/**
 * The fewest stats a stats slide shows.
 */
export const MIN_STATS = 2;

/**
 * The most stats a stats slide shows; more belong in a table or a chart.
 */
export const MAX_STATS = 4;

/**
 * The longest stat value, in characters: `$18.6M`, `4.1 °C` or `1 in 4`.
 */
export const STAT_VALUE_MAX_CHARS = 8;

/**
 * The longest stat label, in characters: two lines under the number in a third of the row.
 */
export const STAT_LABEL_MAX_CHARS = 48;

/**
 * The longest stat label in a row of four, in characters: two lines in a quarter of the row.
 */
export const STAT_LABEL_MAX_CHARS_IN_FOUR = 32;

/**
 * The longest delta, in characters: one line in a quarter of the row.
 */
export const STAT_DELTA_MAX_CHARS = 24;

/**
 * The longest stats title, in characters: two lines at the smallest fit step.
 */
export const STATS_TITLE_MAX_CHARS = 90;

/**
 * Whether a change is good, bad or neither.
 */
export const DELTA_TONES = ['positive', 'negative', 'neutral'] as const;

/**
 * Which way a change points, for a delta written without a sign or arrow.
 */
export const DELTA_TRENDS = ['up', 'down', 'flat'] as const;

/**
 * One big number: the value, what it counts, and how it changed. Keys it does not define are
 * rejected, so a misspelt `tone` or `delta` fails the build instead of disappearing.
 */
const Stat = Schema.Struct({
  value: Schema.Union([
    Schema.Finite,
    Schema.NonEmptyString.check(
      Schema.isMaxLength(STAT_VALUE_MAX_CHARS, {
        message: `Expected a value of at most ${STAT_VALUE_MAX_CHARS} characters, such as "34%"`,
      }),
    ),
  ]),
  label: Schema.NonEmptyString.check(
    Schema.isMaxLength(STAT_LABEL_MAX_CHARS, {
      message: `Expected a label of at most ${STAT_LABEL_MAX_CHARS} characters`,
    }),
  ),
  delta: Schema.optionalKey(
    Schema.NonEmptyString.check(
      Schema.isMaxLength(STAT_DELTA_MAX_CHARS, {
        message: `Expected a delta of at most ${STAT_DELTA_MAX_CHARS} characters`,
      }),
    ),
  ),
  tone: Schema.optionalKey(Schema.Literals(DELTA_TONES)),
  trend: Schema.optionalKey(Schema.Literals(DELTA_TRENDS)),
  highlight: Schema.optionalKey(Schema.Boolean),
});

/**
 * One stat as a slide's frontmatter writes it, decoded.
 */
export type StatEntry = typeof Stat.Type;

/**
 * The contract of the `stats` layout: two to four big numbers.
 */
export const statsLayoutContract = defineLayoutContract({
  name: 'stats',
  description:
    'Two to four big numbers in a row, each with what it counts and, optionally, how it ' +
    'changed. The title states what the numbers mean together. The row stands on one line on ' +
    'every stats slide; set `highlight: true` on the stat the point rests on. Use it when the ' +
    'point is the size of something; use a chart (or split with one) for a trend, and a table ' +
    'for more than four figures; ' +
    'use market for nested sizes or dashboard for related charts.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    stats: Schema.Array(Stat).check(
      Schema.isMinLength(MIN_STATS, { message: `Expected at least ${MIN_STATS} stats` }),
      Schema.isMaxLength(MAX_STATS, { message: `Expected at most ${MAX_STATS} stats` }),
    ),
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    stats:
      `List ${MIN_STATS} to ${MAX_STATS} stats, each with \`value\` (as shown, such as "34%", ` +
      `up to ${STAT_VALUE_MAX_CHARS} characters), \`label\` (up to ${STAT_LABEL_MAX_CHARS} ` +
      `characters, ${STAT_LABEL_MAX_CHARS_IN_FOUR} in a row of four), and optionally \`delta\` ` +
      `("+12% since 2023", up to ${STAT_DELTA_MAX_CHARS} characters), ` +
      '`tone` (positive, negative or ' +
      'neutral; set it when a fall is good news), `trend` (up, down or flat, for a delta without ' +
      'a sign) and `highlight: true` for the stat that matters most.',
    chrome: CHROME_HINT,
  },
  title: { required: true, maxChars: STATS_TITLE_MAX_CHARS },
  slots: {
    body: {
      description:
        'One sentence of context under the title. Set what the numbers mean together in ' +
        '`title:`.',
      accepts: ['text'],
    },
    footnote: {
      description: 'The source of the numbers, on the bottom line.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: 24 },
    footnote: { maxWords: 30 },
  },
  variants: [
    {
      name: 'four stats',
      when: { counts: { stats: MAX_STATS } },
      budget: {},
      // A row of four leaves a quarter of the width to each label.
      fields: { 'stats[].label': { maxChars: STAT_LABEL_MAX_CHARS_IN_FOUR } },
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
      title: 'Three summers of the Eastgate pilot',
      stats: [
        { value: '1,240', label: 'street trees planted on 38 blocks' },
        {
          value: '−2.8 °C',
          label: 'average afternoon street temperature',
          delta: '−0.9 °C vs. 2025',
          tone: 'positive',
          highlight: true,
        },
        {
          value: '−31%',
          label: 'heat-related emergency visits',
          delta: '−12 pts vs. control',
          tone: 'positive',
        },
      ],
    },
    body: [
      '<Footnote>Pilot blocks against matched control blocks, June to August.</Footnote>',
      '',
      '<Notes>',
      'Start with the temperature: it is the number the committee asked about.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
