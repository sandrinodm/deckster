import { defineLayoutContract, type FieldProblem } from '@deckster/engine/layout';
import { Effect, Schema } from 'effect';

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
 * The fewest plans a pricing slide sets side by side.
 */
export const MIN_PLANS = 2;

/**
 * The most plans a pricing slide sets side by side; more belong in a table.
 */
export const MAX_PLANS = 4;

/**
 * The fewest features a plan lists: one is a description, not a list.
 */
export const MIN_PLAN_FEATURES = 2;

/**
 * The most features a plan lists: four plans of four make sixteen lines, as many as a slide holds
 * in the brands with the largest type. A longer list belongs in a table of what each plan
 * includes.
 */
export const MAX_PLAN_FEATURES = 4;

/**
 * The longest plan name, in characters: one line at the title step in a third of the row.
 */
export const PLAN_NAME_MAX_CHARS = 20;

/**
 * The longest plan name in a row of four, in characters: one line in a quarter of the row.
 */
export const PLAN_NAME_MAX_CHARS_IN_FOUR = 16;

/**
 * The longest price, in characters, set as the hero figure of its column: `€3.40`, `$1,250`,
 * `Free`, `Custom`.
 */
export const PLAN_PRICE_MAX_CHARS = 8;

/**
 * The longest period beside a price, in characters: `per month`, `a drop`, `per seat a year`.
 */
export const PLAN_PERIOD_MAX_CHARS = 16;

/**
 * The longest plan description, in characters: two lines of small type in a third of the row.
 */
export const PLAN_DESCRIPTION_MAX_CHARS = 40;

/**
 * The longest plan description in a row of four, in characters.
 */
export const PLAN_DESCRIPTION_MAX_CHARS_IN_FOUR = 32;

/**
 * The longest feature, in characters: two lines in a third of the row.
 */
export const PLAN_FEATURE_MAX_CHARS = 28;

/**
 * The longest feature in a row of four, in characters: two lines in a quarter of the row.
 */
export const PLAN_FEATURE_MAX_CHARS_IN_FOUR = 22;

/**
 * The longest badge over the recommended plan, in characters: one line of label type.
 */
export const PLAN_BADGE_MAX_CHARS = 20;

/**
 * The longest badge in a row of four, in characters: one line of label type in a quarter of the
 * row.
 */
export const PLAN_BADGE_MAX_CHARS_IN_FOUR = 14;

/**
 * The badge over the recommended plan when the slide names none.
 */
export const DEFAULT_PLAN_BADGE = 'Recommended';

/**
 * The longest pricing title, in characters: one line, so the plans keep the height of the slide.
 */
export const PRICING_TITLE_MAX_CHARS = 50;

/**
 * The most words of the source or caveat on the bottom line, one line under the plans: prices
 * before tax, a date.
 */
const PRICING_FOOTNOTE_MAX_WORDS = 16;

/**
 * One plan: its name, its price and the period it pays for, a line on who it is for, what it
 * includes, and whether it is the one recommended.
 */
const PricingPlan = Schema.Struct({
  name: textField(PLAN_NAME_MAX_CHARS, 'a plan name'),
  price: Schema.Union([Schema.Finite, textField(PLAN_PRICE_MAX_CHARS, 'a price')]),
  period: Schema.optionalKey(textField(PLAN_PERIOD_MAX_CHARS, 'a period')),
  description: textField(PLAN_DESCRIPTION_MAX_CHARS, 'a plan description'),
  features: Schema.Array(textField(PLAN_FEATURE_MAX_CHARS, 'a feature')).check(
    Schema.isMinLength(MIN_PLAN_FEATURES, {
      message: `Expected at least ${MIN_PLAN_FEATURES} features`,
    }),
    Schema.isMaxLength(MAX_PLAN_FEATURES, {
      message: `Expected at most ${MAX_PLAN_FEATURES} features`,
    }),
  ),
  recommended: Schema.optionalKey(Schema.Boolean),
});

/**
 * One plan as a slide's frontmatter writes it, decoded.
 */
export type PricingPlanEntry = typeof PricingPlan.Type;

/**
 * What the schema cannot check field by field: at most one plan is recommended.
 *
 * @param plans - The decoded plans.
 * @returns The problem, or nothing.
 */
export function pricingProblems(plans: readonly PricingPlanEntry[]): FieldProblem[] {
  const recommended = plans.filter((plan) => plan.recommended === true);
  if (recommended.length <= 1) {
    return [];
  }

  return [
    {
      path: 'plans',
      message:
        `${recommended.length} plans are recommended ` +
        `(${recommended.map((plan) => plan.name).join(', ')}); a pricing slide recommends at ` +
        'most one.',
      fix: 'Keep `recommended: true` on the one plan you recommend and remove it from the others.',
    },
  ];
}

/**
 * The contract of the `pricing` layout: two to four plans side by side, each with its own price.
 */
export const pricingLayoutContract = defineLayoutContract({
  name: 'pricing',
  description:
    'Two to four plans or tiers side by side under a title that states the point, from `plans:` ' +
    'in the frontmatter. Each plan is a column with its name, a one-line description, its price ' +
    'set as the column\'s hero figure with an optional period ("per month") beside it, and two ' +
    'to four short features under a rule. Mark the plan you recommend with `recommended: true`: ' +
    'its column is lit on the accent surface with a badge on its top edge (`badge:`, ' +
    '"Recommended" by default). `reveal: true` brings the plans in one per step. Use it when ' +
    'each option has its own price and its own list of what it includes; use comparison when ' +
    'the options are measured on the same rows, a table for more than four plans or a full ' +
    'feature grid, and stats when each option is one number.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    plans: Schema.Array(PricingPlan).check(
      Schema.isMinLength(MIN_PLANS, { message: `Expected at least ${MIN_PLANS} plans` }),
      Schema.isMaxLength(MAX_PLANS, { message: `Expected at most ${MAX_PLANS} plans` }),
    ),
    badge: textField(PLAN_BADGE_MAX_CHARS, 'a badge').pipe(
      Schema.withDecodingDefaultKey(Effect.succeed(DEFAULT_PLAN_BADGE)),
    ),
    reveal: RevealField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    plans:
      `List ${MIN_PLANS} to ${MAX_PLANS} plans in the order of their columns, each with \`name\` ` +
      `(up to ${PLAN_NAME_MAX_CHARS} characters, ${PLAN_NAME_MAX_CHARS_IN_FOUR} in a row of ` +
      `four), \`price\` (a number or a figure as shown, up to ${PLAN_PRICE_MAX_CHARS} ` +
      'characters: "€3.40", "Free"), `description` (one line on who it is for, up to ' +
      `${PLAN_DESCRIPTION_MAX_CHARS}, ${PLAN_DESCRIPTION_MAX_CHARS_IN_FOUR} in a row of four) ` +
      `and \`features\` (${MIN_PLAN_FEATURES} to ${MAX_PLAN_FEATURES} short lines, each up to ` +
      `${PLAN_FEATURE_MAX_CHARS} characters, ${PLAN_FEATURE_MAX_CHARS_IN_FOUR} in a row of ` +
      `four), and optionally \`period\` (up to ${PLAN_PERIOD_MAX_CHARS}: "per month") and ` +
      '`recommended: true` on the one plan you recommend.',
    badge:
      `Write the word over the recommended plan, up to ${PLAN_BADGE_MAX_CHARS} characters ` +
      `(${PLAN_BADGE_MAX_CHARS_IN_FOUR} in a row of four), such as \`badge: Most popular\`; it ` +
      'defaults to "Recommended".',
    reveal: REVEAL_HINT,
    chrome: CHROME_HINT,
  },
  checks: (frontmatter) => pricingProblems(frontmatter.plans),
  title: { required: true, maxChars: PRICING_TITLE_MAX_CHARS },
  slots: {
    body: {
      description:
        'One sentence under the title on how to choose between the plans. Put the plans in ' +
        '`plans:`, not here.',
      accepts: ['text'],
    },
    footnote: {
      description: 'A source or caveat on the bottom line: prices before tax, from a date.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: CONTEXT_MAX_WORDS },
    footnote: { maxWords: PRICING_FOOTNOTE_MAX_WORDS },
  },
  variants: [
    {
      name: 'four plans',
      when: { counts: { plans: MAX_PLANS } },
      budget: {},
      // A quarter of the row leaves each plan fewer characters a line.
      fields: {
        'plans[].name': { maxChars: PLAN_NAME_MAX_CHARS_IN_FOUR },
        'plans[].description': { maxChars: PLAN_DESCRIPTION_MAX_CHARS_IN_FOUR },
        'plans[].features[]': { maxChars: PLAN_FEATURE_MAX_CHARS_IN_FOUR },
        badge: { maxChars: PLAN_BADGE_MAX_CHARS_IN_FOUR },
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
      title: 'Most schools need the district plan',
      eyebrow: 'Tree care contracts',
      badge: 'Most schools',
      plans: [
        {
          name: 'Single site',
          price: '$900',
          period: 'a year',
          description: 'One school ground, up to 40 trees',
          features: ['Two inspections a year', 'Storm call-outs'],
        },
        {
          name: 'District',
          price: '$6,400',
          period: 'a year',
          description: 'Every school in one district',
          features: ['Quarterly inspections', 'Storm call-outs', 'A named arborist'],
          recommended: true,
        },
        {
          name: 'City',
          price: 'Custom',
          description: 'Every public ground in the city',
          features: ['Monthly inspections', 'Planting included', 'A crew on call'],
        },
      ],
    },
    body: [
      'Eight schools or more and the district plan costs less per site.',
      '',
      '<Footnote>Prices for the 2027 season, before sales tax.</Footnote>',
      '',
      '<Notes>',
      'Name the district plan first: it is what most of the room needs. Then the two on either ' +
        'side.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
