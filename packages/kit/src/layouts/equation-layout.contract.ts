import type { FieldProblem } from '@deckster/engine/layout';

import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import {
  CHROME_HINT,
  chromeField,
  CONTEXT_MAX_WORDS,
  EYEBROW_HINT,
  EyebrowField,
  RevealField,
  textField,
} from '#layouts/layout-fields.ts';

/**
 * The fewest terms an equation joins: two figures and an operator between them.
 */
export const MIN_TERMS = 2;

/**
 * The most terms an equation joins; a longer sum belongs in a table or a waterfall chart.
 */
export const MAX_TERMS = 4;

/**
 * The longest figure of a term or of the result, in characters: `2,400`, `$380`, `1 in 4`.
 */
export const EQUATION_VALUE_MAX_CHARS = 8;

/**
 * The longest label under a term, in characters: three lines in the narrowest term, a quarter of
 * the row beside the result.
 */
export const EQUATION_LABEL_MAX_CHARS = 32;

/**
 * The longest label under the result, in characters: two lines on the result's panel.
 */
export const EQUATION_RESULT_LABEL_MAX_CHARS = 40;

/**
 * The longest equation title, in characters: two lines across the slide at the smallest fit step.
 */
export const EQUATION_TITLE_MAX_CHARS = 60;

/**
 * The most words of the source of the figures on the bottom line.
 */
const EQUATION_FOOTNOTE_MAX_WORDS = 16;

/**
 * The operators a term may join the one before it with, by the name a slide writes, and the sign
 * the layout sets for each.
 */
export const EQUATION_OPERATORS = {
  /**
   * Multiplication: customers × price.
   */
  times: '×',

  /**
   * Addition.
   */
  plus: '+',

  /**
   * Subtraction, set with the true minus sign.
   */
  minus: '−',

  /**
   * Division: lifetime value ÷ acquisition cost.
   */
  divide: '÷',
} as const;

/**
 * The name of an operator, as a slide writes it in `op:`.
 */
export type EquationOperator = keyof typeof EQUATION_OPERATORS;

/**
 * The operator names, in the order the hints list them.
 */
const OPERATOR_NAMES = Object.keys(EQUATION_OPERATORS) as EquationOperator[];

/**
 * A figure as a slide writes it: a number, or text as it should be shown.
 */
const Value = Schema.Union([Schema.Finite, textField(EQUATION_VALUE_MAX_CHARS, 'a figure')]);

/**
 * One term of the equation: its figure, what it counts and the operator that joins it to the term
 * before it.
 */
const Term = Schema.Struct({
  value: Value,
  label: textField(EQUATION_LABEL_MAX_CHARS, 'a label'),
  op: Schema.optionalKey(Schema.Literals(OPERATOR_NAMES)),
});

/**
 * One term as a slide's frontmatter writes it, decoded.
 */
export type EquationTerm = typeof Term.Type;

/**
 * The result: the figure the terms come to and what it is.
 */
const Result = Schema.Struct({
  value: Value,
  label: textField(EQUATION_RESULT_LABEL_MAX_CHARS, 'a label'),
});

/**
 * The result as a slide's frontmatter writes it, decoded.
 */
export type EquationResult = typeof Result.Type;

/**
 * The problems with a list of terms: the first stands alone, so it takes no operator, and every
 * later one needs the operator that joins it to the one before.
 *
 * @param terms - The decoded terms.
 * @returns One problem per term whose operator is missing or not wanted.
 */
export function equationProblems(terms: readonly EquationTerm[]): FieldProblem[] {
  const names = OPERATOR_NAMES.join(', ');
  return terms.flatMap((term, index): FieldProblem[] => {
    if (index === 0 && term.op !== undefined) {
      return [
        {
          path: 'terms[0].op',
          message: 'The first term has an operator, but nothing comes before it.',
          fix: 'Leave `op` out of the first term; each later term names the operator before it.',
        },
      ];
    }

    if (index > 0 && term.op === undefined) {
      return [
        {
          path: `terms[${index}].op`,
          message: `Term ${index + 1} has no operator joining it to term ${index}.`,
          fix: `Write \`op:\` on the term as one of ${names}, such as \`op: times\`.`,
        },
      ];
    }

    return [];
  });
}

/**
 * The contract of the `equation` layout: two to four figures joined by operators, and the result
 * they come to on an accent panel.
 */
export const equationLayoutContract = defineLayoutContract({
  name: 'equation',
  description:
    'A number built from its parts, written as a sum: two to four figures (`terms:`) in a row, ' +
    'each with a label and joined to the one before by an operator (`op: times`, `plus`, ' +
    '`minus` or `divide`, set as ×, +, −, ÷), then an ' +
    'equals sign and the `result:` set largest on an accent panel that runs to the right and ' +
    'bottom edges of the slide. The figures share a baseline and the operators are set quieter ' +
    'than the figures; `reveal: true` brings the terms in left to right, one per step, and the ' +
    'result last, counting up. Use it for a bottom-up market size (customers × price × ' +
    'frequency), a business model (bookings × take rate = revenue) or unit economics (lifetime ' +
    'value ÷ acquisition cost); use stats when the figures stand side by side without adding ' +
    'up, and a chart for a trend; ' +
    'use market for nested market sizes.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    terms: Schema.Array(Term).check(
      Schema.isMinLength(MIN_TERMS, { message: `Expected at least ${MIN_TERMS} terms` }),
      Schema.isMaxLength(MAX_TERMS, { message: `Expected at most ${MAX_TERMS} terms` }),
    ),
    result: Result,
    reveal: RevealField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    terms:
      `List ${MIN_TERMS} to ${MAX_TERMS} terms in the order the sum reads, each with \`value\` ` +
      `(the figure as shown, such as "2,400" or "$380", up to ${EQUATION_VALUE_MAX_CHARS} ` +
      `characters) and \`label\` (what it counts, up to ${EQUATION_LABEL_MAX_CHARS}). Every ` +
      `term after the first takes \`op\`, the operator before it: ${OPERATOR_NAMES.join(', ')}.`,
    result:
      `Write \`result:\` with \`value\` (the figure the terms come to, up to ` +
      `${EQUATION_VALUE_MAX_CHARS} characters, such as "$1.1M") and \`label\` (what it is, up ` +
      `to ${EQUATION_RESULT_LABEL_MAX_CHARS} characters).`,
    reveal:
      'Write `reveal: true` to bring the terms in one per step, left to right, and the result ' +
      'on the last step, or leave it out to show the whole equation at once.',
    chrome: CHROME_HINT,
  },
  checks: (frontmatter) => equationProblems(frontmatter.terms),
  title: { required: true, maxChars: EQUATION_TITLE_MAX_CHARS },
  slots: {
    body: {
      description:
        'One sentence under the title on what the result means. Put the figures in `terms:` ' +
        'and `result:`, not here.',
      accepts: ['text'],
    },
    footnote: {
      description: 'The source of the figures, on the bottom line under the terms.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: CONTEXT_MAX_WORDS },
    footnote: { maxWords: EQUATION_FOOTNOTE_MAX_WORDS },
  },
  pptx: {
    type: 'title-only',
    placeholders: [
      { kind: 'title', from: { selector: '.kit-title' } },
      { kind: 'body', from: { slot: 'body' } },
    ],
  },
  example: {
    // Four terms, the most an equation takes, so a list filled to its maximum by repeating the
    // example still gives every later term its operator.
    frontmatter: {
      title: 'The first planting costs the city $900k',
      eyebrow: 'Bottom up',
      terms: [
        { value: 600, label: 'street trees this spring' },
        { value: '$1,450', label: 'stock, crew and pit for each', op: 'times' },
        { value: '$210k', label: 'three summers of watering', op: 'plus' },
        { value: '$180k', label: 'from the state canopy grant', op: 'minus' },
      ],
      result: { value: '$900k', label: "the city's share of the first 600 trees" },
    },
    body: [
      'Less than one summer of heat emergencies costs.',
      '',
      '<Footnote>Contractor quotes, March 2026; grant award letter, April 2026.</Footnote>',
      '',
      '<Notes>',
      'Read it left to right: the trees, what each one costs, the watering, less the grant.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
