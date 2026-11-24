import type { FieldProblem } from '@deckster/engine/layout';

import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import {
  CHROME_HINT,
  chromeField,
  EYEBROW_HINT,
  EyebrowField,
  RevealField,
  textField,
} from '#layout-fields.ts';

/**
 * The longest amount, in characters: `$2.4M`, `€1,200,000`, `12 FTE`, `March 3`.
 */
export const ASK_AMOUNT_MAX_CHARS = 10;

/**
 * The longest label over the amount, in characters: `Seed round`, `Capital line, 2027–29`.
 */
export const ASK_LABEL_MAX_CHARS = 24;

/**
 * The fewest milestones an ask names.
 */
export const ASK_MIN_MILESTONES = 2;

/**
 * The most milestones an ask names; more are a plan, for the timeline layout.
 */
export const ASK_MAX_MILESTONES = 4;

/**
 * The longest milestone, in characters: two lines between its number and its date.
 */
export const ASK_MILESTONE_MAX_CHARS = 56;

/**
 * The longest milestone date, in characters: `Autumn 2027`, `Q3 2028`, `Month 18`.
 */
export const ASK_DATE_MAX_CHARS = 12;

/**
 * The fewest allocations a use of funds shows.
 */
export const ASK_MIN_FUNDS = 2;

/**
 * The most allocations a use of funds shows.
 */
export const ASK_MAX_FUNDS = 5;

/**
 * The longest allocation label, in characters: two lines in a fifth of the bar.
 */
export const ASK_FUND_LABEL_MAX_CHARS = 20;

/**
 * How far the shares may sum from 100, so shares rounded to one decimal (33.3 three times) pass and
 * shares that leave a whole point out do not.
 */
export const ASK_SHARE_TOLERANCE = 0.5;

/**
 * The total the shares of a use of funds add up to, in percent of the amount.
 */
const SHARE_TOTAL_PERCENT = 100;

/**
 * How many steps a percent is split into in the problem message, so the total is rounded to a tenth
 * of a percent.
 */
const TENTHS_PER_PERCENT = 10;

/**
 * The longest ask title, in characters: three lines in the five columns of the panel at the
 * smallest fit step.
 */
export const ASK_TITLE_MAX_CHARS = 40;

/**
 * The most words of the sentence over the milestones.
 */
export const ASK_CONTEXT_MAX_WORDS = 16;

/**
 * One milestone the amount buys: what will be true, and by when.
 */
const Milestone = Schema.Struct({
  text: textField(ASK_MILESTONE_MAX_CHARS, 'a milestone'),
  by: Schema.Union([Schema.Finite, textField(ASK_DATE_MAX_CHARS, 'a date')]),
});

/**
 * One milestone as a slide's frontmatter writes it, decoded.
 */
export type AskMilestone = typeof Milestone.Type;

/**
 * One allocation of the amount: what it pays for and its share in percent.
 */
const Fund = Schema.Struct({
  label: textField(ASK_FUND_LABEL_MAX_CHARS, 'an allocation label'),
  share: Schema.Finite.check(
    Schema.makeFilter((share: number) => share > 0 && share <= SHARE_TOTAL_PERCENT, {
      message: `Expected a share in percent, more than 0 and at most ${SHARE_TOTAL_PERCENT}`,
    }),
  ),
});

/**
 * One allocation as a slide's frontmatter writes it, decoded.
 */
export type AskFund = typeof Fund.Type;

/**
 * The problem with a use of funds whose shares do not add up to 100, or none.
 *
 * @param funds - The decoded allocations, if the slide has any.
 * @returns The problem, or nothing.
 */
export function fundsProblems(funds: readonly AskFund[] | undefined): FieldProblem[] {
  if (funds === undefined) {
    return [];
  }

  const total = funds.reduce((sum, fund) => sum + fund.share, 0);
  if (Math.abs(total - SHARE_TOTAL_PERCENT) <= ASK_SHARE_TOLERANCE) {
    return [];
  }

  const rounded = Math.round(total * TENTHS_PER_PERCENT) / TENTHS_PER_PERCENT;
  return [
    {
      path: 'funds',
      message: `The shares add up to ${rounded}, not ${SHARE_TOTAL_PERCENT}.`,
      fix:
        'Give each allocation its share of the amount in percent, so the shares add up to 100; ' +
        'round one share up or down, or add the rest as its own allocation such as "Reserve".',
    },
  ];
}

/**
 * The contract of the `ask` layout: one amount on an accent panel, and the dated milestones it buys
 * beside it.
 */
export const askLayoutContract = defineLayoutContract({
  name: 'ask',
  description:
    'A request to decide: one specific `amount` (no range), set as the hero figure under the ' +
    'title on an accent panel down the left of the slide, and beside it two to four dated ' +
    '`milestones` the amount buys, numbered, with their dates aligned on the right. Optional ' +
    '`funds` draw how the amount divides as one thin segmented bar under the milestones, each ' +
    'allocation labelled with its share. `reveal: true` brings the amount first, then the ' +
    'milestones one per step, then the bar. Use it for the ask of a pitch or a budget request ' +
    '(money, headcount, a date to commit to); use closing for the last slide with contacts, ' +
    'stats or the <BigNumber> chart for a figure with no request, and timeline for a plan ' +
    'with more than four dates.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    amount: Schema.Union([Schema.Finite, textField(ASK_AMOUNT_MAX_CHARS, 'an amount')]),
    label: Schema.optionalKey(textField(ASK_LABEL_MAX_CHARS, 'a label')),
    milestones: Schema.Array(Milestone).check(
      Schema.isMinLength(ASK_MIN_MILESTONES, {
        message: `Expected at least ${ASK_MIN_MILESTONES} milestones`,
      }),
      Schema.isMaxLength(ASK_MAX_MILESTONES, {
        message: `Expected at most ${ASK_MAX_MILESTONES} milestones`,
      }),
    ),
    funds: Schema.optionalKey(
      Schema.Array(Fund).check(
        Schema.isMinLength(ASK_MIN_FUNDS, {
          message: `Expected at least ${ASK_MIN_FUNDS} allocations`,
        }),
        Schema.isMaxLength(ASK_MAX_FUNDS, {
          message: `Expected at most ${ASK_MAX_FUNDS} allocations`,
        }),
      ),
    ),
    reveal: RevealField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    amount:
      'Write the one amount you ask for as it should read, such as `amount: $2.4M` or `amount: ' +
      `12 FTE\` (up to ${ASK_AMOUNT_MAX_CHARS} characters); a single figure, never a range.`,
    label:
      `Write a few words over the amount (up to ${ASK_LABEL_MAX_CHARS} characters), such as ` +
      '`label: Seed round`, or leave it out.',
    milestones:
      `List ${ASK_MIN_MILESTONES} to ${ASK_MAX_MILESTONES} milestones the amount buys, in time ` +
      `order, each with \`text\` (a measurable result, up to ${ASK_MILESTONE_MAX_CHARS} ` +
      `characters) and \`by\` (when, up to ${ASK_DATE_MAX_CHARS} characters: Q3 2027).`,
    funds:
      `Optionally list ${ASK_MIN_FUNDS} to ${ASK_MAX_FUNDS} allocations of the amount, largest ` +
      `first, each with \`label\` (up to ${ASK_FUND_LABEL_MAX_CHARS} characters) and \`share\` ` +
      '(its percent of the amount, as a number such as `share: 45`). The shares must add up ' +
      `to 100 (within ${ASK_SHARE_TOLERANCE}); the build fails otherwise.`,
    reveal:
      'Write `reveal: true` to bring the amount in first, then the milestones one per step, ' +
      'then the use of funds, or leave it out to show everything at once.',
    chrome: CHROME_HINT,
  },
  checks: (frontmatter) => fundsProblems(frontmatter.funds),
  title: { required: true, maxChars: ASK_TITLE_MAX_CHARS },
  slots: {
    body: {
      description:
        'One sentence over the milestones on what the amount buys. Put the amount in ' +
        '`amount:` and the milestones in `milestones:`, not here.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: ASK_CONTEXT_MAX_WORDS },
  },
  pptx: {
    type: 'two-content',
    placeholders: [
      { kind: 'title', from: { selector: '.kit-title' } },
      { kind: 'body', from: { slot: 'body' } },
    ],
  },
  example: {
    frontmatter: {
      title: 'Fund three years of planting',
      eyebrow: 'The ask',
      amount: '$2.4M',
      label: 'Capital line, 2027–29',
      milestones: [
        { text: '1,600 street trees on the 40 hottest blocks', by: 'Autumn 2027' },
        { text: 'Every new tree watered through three summers', by: 'Summer 2028' },
        { text: 'Canopy on the hottest blocks up from 9% to 14%', by: 2029 },
      ],
      // Five allocations, the most a slide takes, so a list filled to its maximum by repeating the
      // example still adds up to 100.
      funds: [
        { label: 'Planting crews', share: 40 },
        { label: 'Nursery stock', share: 25 },
        { label: 'Watering', share: 15 },
        { label: 'Tree survey', share: 12 },
        { label: 'Reporting', share: 8 },
      ],
    },
    body: [
      'What the committee buys with the ten-year line’s first tranche.',
      '',
      '<Notes>',
      'Say the amount once and stop. Then walk the dates: each one is something the committee ' +
        'can check.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
