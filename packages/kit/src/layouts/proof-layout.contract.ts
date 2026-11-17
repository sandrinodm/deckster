import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import {
  CHROME_HINT,
  chromeField,
  EYEBROW_HINT,
  EyebrowField,
  FOCAL_HINT,
  FocalField,
  RevealField,
  textField,
  TREATMENT_HINT,
  TreatmentField,
} from '#layouts/layout-fields.ts';

/**
 * The fewest metrics a proof slide shows.
 */
export const MIN_PROOF_METRICS = 1;

/**
 * The most metrics a proof slide shows: three in a stack, the first the largest.
 */
export const MAX_PROOF_METRICS = 3;

/**
 * The longest metric figure, in characters, before or after: `38%`, `$1.2M`, `11 days`.
 */
export const PROOF_VALUE_MAX_CHARS = 8;

/**
 * The longest metric label, in characters: two lines in the four columns of the panel.
 */
export const PROOF_LABEL_MAX_CHARS = 40;

/**
 * The longest timeframe, in characters: one line of labels at the top of the panel.
 */
export const PROOF_TIMEFRAME_MAX_CHARS = 20;

/**
 * The longest name of the person quoted, in characters.
 */
export const PROOF_NAME_MAX_CHARS = 32;

/**
 * The longest role of the person quoted, in characters: one line under the name.
 */
export const PROOF_ROLE_MAX_CHARS = 48;

/**
 * The longest customer name, in characters: the logo's alt text, and the wordmark set when the logo
 * has no file.
 */
export const PROOF_CUSTOMER_MAX_CHARS = 32;

/**
 * The most words the quote takes: up to seven lines at the smallest step of its ladder, in seven
 * columns.
 */
export const PROOF_QUOTE_MAX_WORDS = 36;

/**
 * The longest proof title, in characters: two lines in the seven columns beside the panel.
 */
export const PROOF_TITLE_MAX_CHARS = 52;

/**
 * The most words of the source for the numbers on the bottom line, under the quote.
 */
const PROOF_FOOTNOTE_MAX_WORDS = 16;

/**
 * A figure, as a number or as the text to show: `38%`, `$1.2M`, `11 days`.
 */
const Figure = Schema.Union([Schema.Finite, textField(PROOF_VALUE_MAX_CHARS, 'a figure')]);

/**
 * One result: the figure after, what it measures, and optionally the figure before.
 */
const Metric = Schema.Struct({
  value: Figure,
  label: textField(PROOF_LABEL_MAX_CHARS, 'a label'),
  from: Schema.optionalKey(Figure),
});

/**
 * One metric as a slide's frontmatter writes it, decoded.
 */
export type ProofMetric = typeof Metric.Type;

/**
 * The customer: their name and, optionally, their logo's file.
 */
const Customer = Schema.Struct({
  name: textField(PROOF_CUSTOMER_MAX_CHARS, 'a customer name'),
  src: Schema.optionalKey(Schema.NonEmptyString),
});

/**
 * The contract of the `proof` layout: a customer's words beside the numbers that back them.
 */
export const proofLayoutContract = defineLayoutContract({
  name: 'proof',
  description:
    'A named case study: a customer saying what changed, beside the numbers that show it. The ' +
    'title states the result; the quote (the slide body, two or three sentences) takes the ' +
    'wider side, with the person under it (`name:`, `role:`, a small portrait from `photo:`) ' +
    "and the customer's logo set small in one tone (`logo:`). One to three `metrics:` stand on " +
    'an accent panel that runs to the right edge, the first set largest, each with what it ' +
    'measures and optionally the figure before (`from:`, shown as before → after), under an ' +
    'optional `timeframe:` such as "in 6 months". `reveal: true` shows the quote first and ' +
    'brings in the metrics one per step. Use it for traction and sales proof, where one or two ' +
    'named customers with numbers carry more than a logo wall; use quote for words without ' +
    'numbers, stats for numbers without a voice, and logos for a list of customers.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    name: textField(PROOF_NAME_MAX_CHARS, 'a name'),
    role: Schema.optionalKey(textField(PROOF_ROLE_MAX_CHARS, 'a role')),
    photo: Schema.optionalKey(Schema.NonEmptyString),
    focal: FocalField,
    logo: Schema.optionalKey(Customer),
    metrics: Schema.Array(Metric).check(
      Schema.isMinLength(MIN_PROOF_METRICS, {
        message: `Expected at least ${MIN_PROOF_METRICS} metric`,
      }),
      Schema.isMaxLength(MAX_PROOF_METRICS, {
        message: `Expected at most ${MAX_PROOF_METRICS} metrics`,
      }),
    ),
    timeframe: Schema.optionalKey(textField(PROOF_TIMEFRAME_MAX_CHARS, 'a timeframe')),
    reveal: RevealField,
    treatment: TreatmentField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    name:
      `Name who said it, for example \`name: Priya Nair\` (up to ${PROOF_NAME_MAX_CHARS} ` +
      'characters).',
    role:
      'Say who they are at the customer, for example `role: Head of estates, Holloway Housing` ' +
      `(up to ${PROOF_ROLE_MAX_CHARS} characters).`,
    photo:
      'Give their portrait as a file in the deck folder, for example ' +
      '`photo: assets/priya.jpg`, or leave it out.',
    focal: FOCAL_HINT,
    logo:
      "Give the customer's name and logo file, for example `logo: { name: Holloway Housing, " +
      `src: assets/holloway.svg }\` (a name of up to ${PROOF_CUSTOMER_MAX_CHARS} characters; ` +
      'without `src` the name is set in the label style), or leave it out.',
    metrics:
      `List ${MIN_PROOF_METRICS} to ${MAX_PROOF_METRICS} results, the strongest first, each ` +
      `with \`value\` (a number, or a figure as shown of up to ${PROOF_VALUE_MAX_CHARS} ` +
      `characters such as "38%"), \`label\` (what it measures, up to ${PROOF_LABEL_MAX_CHARS} ` +
      'characters) and optionally `from` (the figure before, in the same unit), for example ' +
      '`- { value: 3 days, from: 14 days, label: Median wait for a repair }`.',
    timeframe:
      `Say over what time the results came, for example \`timeframe: In 6 months\` (up to ` +
      `${PROOF_TIMEFRAME_MAX_CHARS} characters), or leave it out.`,
    reveal:
      'Write `reveal: true` to show the quote first and bring in the metrics one per step, or ' +
      'leave it out to show everything at once.',
    treatment: TREATMENT_HINT,
    chrome: CHROME_HINT,
  },
  title: { required: true, maxChars: PROOF_TITLE_MAX_CHARS },
  slots: {
    body: {
      description:
        'The words, without quotation marks (the layout sets them): two or three sentences in ' +
        "the customer's voice. Put the numbers in `metrics:`, not here.",
      required: true,
      accepts: ['quote', 'text'],
    },
    footnote: {
      description: 'A source for the numbers on the bottom line, under the quote.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: PROOF_QUOTE_MAX_WORDS },
    footnote: { maxWords: PROOF_FOOTNOTE_MAX_WORDS },
  },
  pptx: {
    type: 'two-content',
    placeholders: [
      { kind: 'title', from: { selector: '.kit-title' } },
      { kind: 'body', from: { slot: 'body' } },
    ],
  },
  example: {
    comments: [
      "Give the customer's logo and the speaker's portrait as files in the deck folder:",
      '  logo: { name: Holloway Housing, src: assets/logos/holloway-housing.svg }',
      '  photo: assets/people/priya-nair.jpg',
    ],
    frontmatter: {
      title: 'Holloway Housing cut repair waits by four fifths',
      eyebrow: 'Customer story',
      name: 'Priya Nair',
      role: 'Head of estates, Holloway Housing',
      timeframe: 'In 6 months',
      metrics: [
        { value: '3 days', from: '14 days', label: 'Median wait for a tree repair' },
        { value: '92%', from: '61%', label: 'Repairs done on the first visit' },
      ],
    },
    body: [
      'Tenants used to chase us for weeks about a split branch. Now the crew is there before ' +
        'anyone has to ask twice.',
      '',
      '<Footnote>Holloway Housing repair log, March to August 2026.</Footnote>',
      '',
      '<Notes>',
      'Let the quote land, then walk the numbers from the top.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
