import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import {
  CHROME_HINT,
  chromeField,
  CONTEXT_MAX_WORDS,
  currentProblems,
  EYEBROW_HINT,
  EyebrowField,
  REVEAL_HINT,
  RevealField,
  textField,
} from '#layout-fields.ts';

/**
 * The fewest milestones a timeline shows.
 */
export const MIN_MILESTONES = 3;

/**
 * The most milestones a timeline slide shows: five columns keep the detail at the small size, well
 * above the brand's smallest type; a longer history is two slides or a table.
 */
export const MAX_MILESTONES = 5;

/**
 * The longest date, in characters: `Q3 2026`, `March`, `Spring 2027`.
 */
export const MILESTONE_DATE_MAX_CHARS = 12;

/**
 * The longest milestone title, in characters: two lines in a quarter of the row.
 */
export const MILESTONE_TITLE_MAX_CHARS = 32;

/**
 * The longest milestone detail, in characters: three lines in a quarter of the row.
 */
export const MILESTONE_DETAIL_MAX_CHARS = 40;

/**
 * The longest milestone title in a row of five, in characters.
 */
export const MILESTONE_TITLE_MAX_CHARS_DENSE = 24;

/**
 * The longest milestone detail in a row of five, in characters.
 */
export const MILESTONE_DETAIL_MAX_CHARS_DENSE = 32;

/**
 * The longest timeline title, in characters: two lines at the smallest fit step.
 */
export const TIMELINE_TITLE_MAX_CHARS = 60;

/**
 * How a milestone is marked: done, slipped or tentative.
 */
export const MILESTONE_STATES = ['success', 'error', 'muted'] as const;

/**
 * One milestone: when, what, and a line of detail.
 */
const MilestoneItem = Schema.Struct({
  date: textField(MILESTONE_DATE_MAX_CHARS, 'a date'),
  title: textField(MILESTONE_TITLE_MAX_CHARS, 'a milestone title'),
  detail: Schema.optionalKey(textField(MILESTONE_DETAIL_MAX_CHARS, 'a milestone detail')),
  state: Schema.optionalKey(Schema.Literals(MILESTONE_STATES)),
});

/**
 * One milestone as a slide's frontmatter writes it, decoded.
 */
export type MilestoneEntry = typeof MilestoneItem.Type;

/**
 * The contract of the `timeline` layout: milestones in time order with where we are now, drawn by
 * the kit's `<Timeline>`.
 */
export const timelineLayoutContract = defineLayoutContract({
  name: 'timeline',
  description:
    'Three to five dated milestones along a line, in time order, from `milestones:` in the ' +
    'frontmatter, drawn by the kit <Timeline>: a roadmap, a history, a migration. `current:` ' +
    'rings the milestone we are at and fills the line up to it; a milestone can be marked done ' +
    '(`state: success`), slipped (`error`) or tentative (`muted`); `reveal: true` adds one ' +
    'milestone per click. Split a longer history over two slides. Use steps for a process ' +
    'without dates, and a chart for values over time; ' +
    'use schedule for lanes with durations.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    milestones: Schema.Array(MilestoneItem).check(
      Schema.isMinLength(MIN_MILESTONES, {
        message: `Expected at least ${MIN_MILESTONES} milestones`,
      }),
      Schema.isMaxLength(MAX_MILESTONES, {
        message: `Expected at most ${MAX_MILESTONES} milestones`,
      }),
    ),
    current: Schema.optionalKey(
      Schema.Int.check(
        Schema.isBetween(
          { minimum: 1, maximum: MAX_MILESTONES },
          { message: `Expected the number of a milestone, from 1 to ${MAX_MILESTONES}` },
        ),
      ),
    ),
    reveal: RevealField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    milestones:
      `List ${MIN_MILESTONES} to ${MAX_MILESTONES} milestones in time order, each with \`date\` ` +
      `(up to ${MILESTONE_DATE_MAX_CHARS} characters: Q3 2026), \`title\` (up to ` +
      `${MILESTONE_TITLE_MAX_CHARS}, ${MILESTONE_TITLE_MAX_CHARS_DENSE} with five) and ` +
      `optionally \`detail\` (up to ${MILESTONE_DETAIL_MAX_CHARS}, ` +
      `${MILESTONE_DETAIL_MAX_CHARS_DENSE} with five) and \`state\` (success, error or ` +
      'muted).',
    current:
      'Write the number of the milestone we are at, `current: 3`, to ring it and fill the line ' +
      'up to it; leave it out to fill the line to the last one.',
    reveal: REVEAL_HINT,
    chrome: CHROME_HINT,
  },
  checks: (frontmatter) => currentProblems(frontmatter, frontmatter.milestones, 'milestone'),
  title: { required: true, maxChars: TIMELINE_TITLE_MAX_CHARS },
  slots: {
    body: {
      description:
        'One sentence under the title on where things stand. Put the milestones in ' +
        '`milestones:`.',
      accepts: ['text'],
    },
    footnote: {
      description: 'A source or caveat on the bottom line.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: CONTEXT_MAX_WORDS },
    footnote: { maxWords: 24 },
  },
  variants: [
    // Five columns leave each milestone fewer characters a line.
    {
      name: '5 milestones',
      when: { counts: { milestones: MAX_MILESTONES } },
      budget: {},
      fields: {
        'milestones[].title': { maxChars: MILESTONE_TITLE_MAX_CHARS_DENSE },
        'milestones[].detail': { maxChars: MILESTONE_DETAIL_MAX_CHARS_DENSE },
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
      title: 'The pilot ran three summers; the plan starts in spring',
      eyebrow: 'Where we are',
      current: 3,
      milestones: [
        {
          date: 'Spring 2024',
          title: 'Pilot planting',
          detail: '410 trees on Holloway Road',
          state: 'success',
        },
        {
          date: 'Summer 2025',
          title: 'First measurements',
          detail: 'Streets 1.9 °C cooler',
          state: 'success',
        },
        { date: 'Autumn 2026', title: 'Committee decision', detail: 'The ten-year capital line' },
        { date: 'Spring 2027', title: 'First 600 trees', detail: 'Eastgate, hottest blocks first' },
      ],
    },
    body: [
      '<Notes>',
      'We are at the third milestone: the decision. Everything after it waits on the vote.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
