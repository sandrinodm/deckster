import { defineLayoutContract, type FieldProblem } from '@deckster/engine/layout';
import { Effect, Schema } from 'effect';

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
} from '#layouts/layout-fields.ts';

/**
 * The fewest labelled time periods on a schedule.
 */
export const SCHEDULE_MIN_PERIODS = 3;

/**
 * The most labelled time periods on a schedule.
 */
export const SCHEDULE_MAX_PERIODS = 8;

/**
 * The fewest workstreams that make a schedule.
 */
export const SCHEDULE_MIN_LANES = 3;

/**
 * The most workstreams a slide holds.
 */
export const SCHEDULE_MAX_LANES = 6;

/**
 * The most duration bars per workstream; each has its own track so overlaps remain legible.
 */
export const SCHEDULE_MAX_BARS = 2;

/**
 * The combined number of bars and optional bar labels that fits with padded lanes.
 */
export const SCHEDULE_MAX_BAR_CONTENT = 12;

/**
 * The longest period label, in characters, on axes of up to six periods.
 */
export const SCHEDULE_PERIOD_MAX_CHARS = 6;

/**
 * The longest period label on a seven- or eight-period axis.
 */
export const SCHEDULE_PERIOD_MAX_CHARS_DENSE = 5;

/**
 * The longest workstream name, in characters.
 */
export const SCHEDULE_LANE_MAX_CHARS = 22;

/**
 * The longest optional bar label, in characters; it sits above the bar rather than inside it.
 */
export const SCHEDULE_BAR_MAX_CHARS = 16;

/**
 * The longest title, in characters, held to one line to leave room for the time grid.
 */
export const SCHEDULE_TITLE_MAX_CHARS = 50;

/**
 * The longest now marker, in characters, centred on its period even at either end of an
 * eight-period axis.
 */
export const SCHEDULE_NOW_LABEL_MAX_CHARS = 6;

/**
 * The longest screen-reader word for the period at now or for the span of a bar, in characters;
 * neither is ever drawn.
 */
export const SCHEDULE_SPOKEN_LABEL_MAX_CHARS = 24;

/**
 * The most words in the schedule's source or caveat, preserving the grid's height.
 */
const SCHEDULE_FOOTNOTE_MAX_WORDS = 16;

/**
 * The English marker and screen-reader words used when the author gives no `labels`.
 */
const DEFAULT_SCHEDULE_LABELS = {
  /**
   * The marker drawn under the period at now.
   */
  now: 'Now',

  /**
   * Read in parentheses after the period at now.
   */
  nowPeriod: 'now',

  /**
   * Read between the first and last period of a bar.
   */
  through: 'through',
} as const;

/**
 * Optional replacements for the visible now marker, the screen-reader note on the period at now and
 * the word read between a bar's first and last period.
 */
const Labels = Schema.Struct({
  now: textField(SCHEDULE_NOW_LABEL_MAX_CHARS, 'a now marker').pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(DEFAULT_SCHEDULE_LABELS.now)),
  ),
  nowPeriod: textField(SCHEDULE_SPOKEN_LABEL_MAX_CHARS, 'a now period label').pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(DEFAULT_SCHEDULE_LABELS.nowPeriod)),
  ),
  through: textField(SCHEDULE_SPOKEN_LABEL_MAX_CHARS, 'a span word').pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(DEFAULT_SCHEDULE_LABELS.through)),
  ),
});

/**
 * Author-supplied now marker and screen-reader words; omitted keys keep the English defaults.
 */
export type ScheduleLabels = typeof Labels.Type;

/**
 * A one-based period index. Cross-field checks also hold it to the actual axis length.
 */
const PeriodIndex = Schema.Int.check(
  Schema.isBetween(
    { minimum: 1, maximum: SCHEDULE_MAX_PERIODS },
    { message: `Expected a period index from 1 to ${SCHEDULE_MAX_PERIODS}` },
  ),
);

/**
 * A duration includes both its first and last periods, so from: 2, to: 2 fills one period.
 */
const ScheduleBar = Schema.Struct({
  from: PeriodIndex,
  to: PeriodIndex,
  label: Schema.optionalKey(textField(SCHEDULE_BAR_MAX_CHARS, 'a bar label')),
});

/**
 * A named workstream with one or two independently labelled durations.
 */
const ScheduleLane = Schema.Struct({
  name: textField(SCHEDULE_LANE_MAX_CHARS, 'a lane name'),
  bars: Schema.Array(ScheduleBar).check(
    Schema.isMinLength(1, { message: 'Expected at least 1 bar' }),
    Schema.isMaxLength(SCHEDULE_MAX_BARS, {
      message: `Expected at most ${SCHEDULE_MAX_BARS} bars`,
    }),
  ),
});

/**
 * A workstream decoded from slide frontmatter.
 */
export type ScheduleLaneEntry = typeof ScheduleLane.Type;

/**
 * Checks inclusive duration bounds against the actual axis, and the current lane against its list.
 * Overlapping bars are allowed and occupy separate tracks. Reversed bounds are rejected.
 */
export function scheduleProblems(frontmatter: {
  readonly periods: readonly string[];
  readonly lanes: readonly ScheduleLaneEntry[];
  readonly current?: number | undefined;
  readonly now?: number | undefined;
}): FieldProblem[] {
  const problems = currentProblems(frontmatter, frontmatter.lanes, 'lane');
  const barContent = frontmatter.lanes.reduce(
    (total, lane) =>
      total + lane.bars.length + lane.bars.filter((bar) => bar.label !== undefined).length,
    0,
  );
  if (barContent > SCHEDULE_MAX_BAR_CONTENT) {
    problems.push({
      path: 'lanes',
      message: `Expected at most ${SCHEDULE_MAX_BAR_CONTENT} bars and bar labels combined.`,
      fix: 'Remove optional bar labels, use fewer bars, or split the schedule across slides.',
    });
  }

  const count = frontmatter.periods.length;
  if (frontmatter.now !== undefined && frontmatter.now > count) {
    problems.push({
      path: 'now',
      message: `Period ${frontmatter.now} is past the ${count}-period axis.`,
      fix: `Set now to a period index from 1 to ${count}, or leave it out.`,
    });
  }

  frontmatter.lanes.forEach((lane, laneIndex) => {
    lane.bars.forEach((bar, barIndex) => {
      if (bar.from > bar.to || bar.to > count) {
        problems.push({
          path: `lanes[${laneIndex}].bars[${barIndex}]`,
          message: `The bar must run forwards within the ${count}-period axis.`,
          fix: `Use inclusive indexes with 1 <= from <= to <= ${count}.`,
        });
      }
    });
  });
  return problems;
}

/**
 * The schedule contract: concurrent workstreams and their durations on a shared time axis.
 */
export const scheduleLayoutContract = defineLayoutContract({
  name: 'schedule',
  description:
    'A plan across time: three to six named lanes share an axis of three to eight labelled ' +
    'periods. Each lane has one or two duration bars, with inclusive one-based from/to period ' +
    'indexes and optional labels above their bars. A labelled now marker sits at the centre ' +
    'of its period; current marks a lane with an arrow and stronger bars. Use it to show ' +
    'parallel delivery, a rollout or overlapping work. Reveal lanes one per click. Use timeline ' +
    'for dated milestones without durations, steps for a sequence without dates, or columns ' +
    'for a Now / Next / Later board without a measured axis. ' +
    'Use table for a timetable with exact dates per row. `labels` renames the now marker and ' +
    'the words read to screen readers, for example `labels: { now: Heute }`.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    periods: Schema.Array(textField(SCHEDULE_PERIOD_MAX_CHARS, 'a period label')).check(
      Schema.isMinLength(SCHEDULE_MIN_PERIODS, {
        message: `Expected at least ${SCHEDULE_MIN_PERIODS} periods`,
      }),
      Schema.isMaxLength(SCHEDULE_MAX_PERIODS, {
        message: `Expected at most ${SCHEDULE_MAX_PERIODS} periods`,
      }),
    ),
    lanes: Schema.Array(ScheduleLane).check(
      Schema.isMinLength(SCHEDULE_MIN_LANES, {
        message: `Expected at least ${SCHEDULE_MIN_LANES} lanes`,
      }),
      Schema.isMaxLength(SCHEDULE_MAX_LANES, {
        message: `Expected at most ${SCHEDULE_MAX_LANES} lanes`,
      }),
    ),
    now: Schema.optionalKey(PeriodIndex),
    current: Schema.optionalKey(
      Schema.Int.check(
        Schema.isBetween(
          { minimum: 1, maximum: SCHEDULE_MAX_LANES },
          { message: `Expected the number of a lane, from 1 to ${SCHEDULE_MAX_LANES}` },
        ),
      ),
    ),
    labels: Labels.pipe(
      Schema.withDecodingDefaultKey(Effect.succeed({ ...DEFAULT_SCHEDULE_LABELS })),
    ),
    reveal: RevealField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    periods:
      `List ${SCHEDULE_MIN_PERIODS} to ${SCHEDULE_MAX_PERIODS} equally spaced periods in order, ` +
      `each up to ${SCHEDULE_PERIOD_MAX_CHARS} characters, or ${SCHEDULE_PERIOD_MAX_CHARS_DENSE} ` +
      'with seven or eight periods: Jan, Wk 2, Q3.',
    lanes:
      `List ${SCHEDULE_MIN_LANES} to ${SCHEDULE_MAX_LANES} lanes with name ` +
      `(up to ${SCHEDULE_LANE_MAX_CHARS} characters) and bars (1 to ${SCHEDULE_MAX_BARS}). ` +
      `Each bar has from and to (inclusive period indexes, 1 to ${SCHEDULE_MAX_PERIODS}, ` +
      'within the actual axis, from <= to) and optionally label ' +
      `(up to ${SCHEDULE_BAR_MAX_CHARS} characters). Use at most ${SCHEDULE_MAX_BAR_CONTENT} ` +
      'bars and bar labels combined; each optional label counts as one. Overlaps use separate tracks.',
    now:
      `Set now to a period index from 1 to ${SCHEDULE_MAX_PERIODS} within the actual axis ` +
      'to label its centre Now, or `labels.now`; omit it for no marker.',
    current:
      `Set current to the number of the lane the talk is on, or the one at now, from 1 to ` +
      `${SCHEDULE_MAX_LANES} within the actual list, to mark it with an arrow and stronger bars.`,
    labels:
      'Optional replacements for `now` (Now), the marker drawn at the now period, 1 to ' +
      `${SCHEDULE_NOW_LABEL_MAX_CHARS} characters; \`nowPeriod\` (now), read in parentheses ` +
      'after that period; and `through` (through), read between the first and last period of ' +
      `each bar. The two read words are never drawn, 1 to ${SCHEDULE_SPOKEN_LABEL_MAX_CHARS} ` +
      'characters each. Omitted keys keep their English defaults. For example, ' +
      '`labels: { now: Heute }`.',
    reveal: REVEAL_HINT,
    chrome: CHROME_HINT,
  },
  checks: scheduleProblems,
  title: { required: true, maxChars: SCHEDULE_TITLE_MAX_CHARS },
  slots: {
    body: {
      description: 'One sentence on what this plan delivers; put durations in lanes.',
      accepts: ['text'],
    },
    footnote: {
      description: 'A source, date or caveat on the bottom line.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: CONTEXT_MAX_WORDS },
    footnote: { maxWords: SCHEDULE_FOOTNOTE_MAX_WORDS },
  },
  variants: [
    {
      name: 'seven or eight periods',
      when: { counts: { periods: { min: 7 } } },
      budget: {},
      fields: { 'periods[]': { maxChars: SCHEDULE_PERIOD_MAX_CHARS_DENSE } },
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
      title: 'Three crews carry the planting season',
      periods: ['Jan', 'Feb', 'Mar', 'Apr'],
      current: 2,
      now: 2,
      labels: { ...DEFAULT_SCHEDULE_LABELS },
      lanes: [
        { name: 'Survey', bars: [{ from: 1, to: 2, label: 'Site visits' }] },
        {
          name: 'Planting',
          bars: [{ from: 2, to: 4, label: 'Eastgate' }],
        },
        { name: 'Tree care', bars: [{ from: 2, to: 4, label: 'Watering' }] },
      ],
    },
    body:
      '<Notes>Survey work overlaps the start of planting; ' +
      'care continues after the crews move on.</Notes>\n',
  },
});
