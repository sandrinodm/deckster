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
} from '#layouts/layout-fields.ts';

/**
 * The fewest risks in a register.
 */
export const MIN_RISKS = 3;

/**
 * The most risks in a register; a longer register belongs on several slides.
 */
export const MAX_RISKS = 5;

/**
 * The longest risk name, in characters.
 */
export const RISK_NAME_MAX_CHARS = 24;

/**
 * The longest mitigation, in characters: one action on one line.
 */
export const RISK_MITIGATION_MAX_CHARS = 42;

/**
 * The longest register title, in characters, held to one line.
 */
export const RISKS_TITLE_MAX_CHARS = 50;

/**
 * The longest column head, in characters, including wide mono brands.
 */
export const RISKS_LABEL_MAX_CHARS = 11;

/**
 * The longest printed level word, in characters, beside its three-bar meter.
 */
export const RISKS_LEVEL_LABEL_MAX_CHARS = 8;

/**
 * The longest screen-reader prefix of the highlighted row, in characters; it is never drawn.
 */
export const RISKS_HIGHLIGHT_LABEL_MAX_CHARS = 24;

/**
 * The most words in the assessment date or caveat under the register.
 */
const RISKS_FOOTNOTE_MAX_WORDS = 16;

/**
 * Optional replacements for the column heads, the level words and the highlighted row's
 * screen-reader prefix.
 */
const Labels = Schema.Struct({
  name: textField(RISKS_LABEL_MAX_CHARS, 'a risk column label').pipe(
    Schema.withDecodingDefaultKey(Effect.succeed('Risk')),
  ),
  likelihood: textField(RISKS_LABEL_MAX_CHARS, 'a likelihood column label').pipe(
    Schema.withDecodingDefaultKey(Effect.succeed('Likelihood')),
  ),
  impact: textField(RISKS_LABEL_MAX_CHARS, 'an impact column label').pipe(
    Schema.withDecodingDefaultKey(Effect.succeed('Impact')),
  ),
  mitigation: textField(RISKS_LABEL_MAX_CHARS, 'a mitigation column label').pipe(
    Schema.withDecodingDefaultKey(Effect.succeed('Mitigation')),
  ),
  low: textField(RISKS_LEVEL_LABEL_MAX_CHARS, 'a low level word').pipe(
    Schema.withDecodingDefaultKey(Effect.succeed('Low')),
  ),
  medium: textField(RISKS_LEVEL_LABEL_MAX_CHARS, 'a medium level word').pipe(
    Schema.withDecodingDefaultKey(Effect.succeed('Medium')),
  ),
  high: textField(RISKS_LEVEL_LABEL_MAX_CHARS, 'a high level word').pipe(
    Schema.withDecodingDefaultKey(Effect.succeed('High')),
  ),
  highlight: textField(RISKS_HIGHLIGHT_LABEL_MAX_CHARS, 'a highlight label').pipe(
    Schema.withDecodingDefaultKey(Effect.succeed('Priority risk')),
  ),
});

/**
 * Author-supplied column heads, level words and highlight prefix; omitted keys keep the English
 * defaults.
 */
export type RisksLabels = typeof Labels.Type;

/**
 * One risk with its two independent levels and the action that reduces it.
 */
const Risk = Schema.Struct({
  name: textField(RISK_NAME_MAX_CHARS, 'a risk name'),
  likelihood: Schema.Literals(['low', 'medium', 'high']),
  impact: Schema.Literals(['low', 'medium', 'high']),
  mitigation: textField(RISK_MITIGATION_MAX_CHARS, 'a mitigation'),
  highlight: Schema.optionalKey(Schema.Boolean),
});

/**
 * One decoded risk, in the order the author writes it.
 */
export type RiskEntry = typeof Risk.Type;

/**
 * Rejects more than one highlighted risk, leaving the author to choose the most severe.
 *
 * @param risks - The decoded register.
 * @returns A field problem when several rows are highlighted, otherwise nothing.
 */
export function risksProblems(risks: readonly RiskEntry[]): FieldProblem[] {
  const highlighted = risks.filter((risk) => risk.highlight === true);
  if (highlighted.length <= 1) {
    return [];
  }

  return [
    {
      path: 'risks',
      message: `${highlighted.length} risks are highlighted; a register highlights at most one.`,
      fix: 'Keep `highlight: true` on the most severe risk and remove it from the others.',
    },
  ];
}

/**
 * The contract of the `risks` layout: a short risk register with an action against every risk.
 */
export const risksLayoutContract = defineLayoutContract({
  name: 'risks',
  description:
    'A risk register of three to five rows under a title that states the point. Each entry in ' +
    '`risks:` has a short `name`, `likelihood` and `impact` (low, medium or high), and a ' +
    'one-line `mitigation`. The two levels show their names and one, two or three filled marks, ' +
    'so meaning never depends on colour. Rows stay in the order written; `highlight: true` ' +
    'lights the most severe row on the accent surface and marks it with a diamond, and ' +
    '`reveal: true` brings rows in one per step. Use it to review what could go wrong and ' +
    'what you will do about it. `labels` renames the column heads and level words, for ' +
    'example `labels: { name: Hazard }`; use table ' +
    'for a longer register with owners, dates or exact scores, matrix to position items on ' +
    'two continuous axes, actions for commitments with owners and deadlines, and steps for ' +
    'the stages of a process.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    risks: Schema.Array(Risk).check(
      Schema.isMinLength(MIN_RISKS, { message: `Expected at least ${MIN_RISKS} risks` }),
      Schema.isMaxLength(MAX_RISKS, { message: `Expected at most ${MAX_RISKS} risks` }),
    ),
    labels: Labels.pipe(
      Schema.withDecodingDefaultKey(
        Effect.succeed({
          name: 'Risk',
          likelihood: 'Likelihood',
          impact: 'Impact',
          mitigation: 'Mitigation',
          low: 'Low',
          medium: 'Medium',
          high: 'High',
          highlight: 'Priority risk',
        }),
      ),
    ),
    reveal: RevealField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    risks:
      `List ${MIN_RISKS} to ${MAX_RISKS} risks in reading order, each with \`name\` (up to ` +
      `${RISK_NAME_MAX_CHARS} characters), \`likelihood\` and \`impact\` (each low, medium or ` +
      `high), and \`mitigation\` (one action of up to ${RISK_MITIGATION_MAX_CHARS} characters). ` +
      'Optionally mark the most severe risk with `highlight: true`, on at most one row.',
    labels:
      'Optional replacements for the column heads `name` (Risk), `likelihood` (Likelihood), ' +
      '`impact` (Impact) and `mitigation` (Mitigation), each 1 to ' +
      `${RISKS_LABEL_MAX_CHARS} characters; the level words \`low\` (Low), \`medium\` (Medium) ` +
      `and \`high\` (High), each 1 to ${RISKS_LEVEL_LABEL_MAX_CHARS} characters; and ` +
      '`highlight` (Priority risk), the screen-reader prefix of the highlighted row, 1 to ' +
      `${RISKS_HIGHLIGHT_LABEL_MAX_CHARS} characters. Omitted keys keep their English defaults. ` +
      'For example, `labels: { name: Hazard }`.',
    reveal: REVEAL_HINT,
    chrome: CHROME_HINT,
  },
  checks: (frontmatter) => risksProblems(frontmatter.risks),
  title: { required: true, maxChars: RISKS_TITLE_MAX_CHARS },
  slots: {
    body: {
      description: 'One line of context under the title. Write the register in `risks:`.',
      accepts: ['text'],
    },
    footnote: {
      description: 'A source, assessment date or caveat on the bottom line.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: CONTEXT_MAX_WORDS },
    footnote: { maxWords: RISKS_FOOTNOTE_MAX_WORDS },
  },
  pptx: {
    type: 'title-only',
    placeholders: [
      { kind: 'title', from: { selector: '.kit-title' } },
      { kind: 'body', from: { slot: 'body' } },
    ],
  },
  example: {
    frontmatter: {
      title: 'Summer watering is the risk we must fund',
      eyebrow: 'Canopy programme',
      labels: {
        name: 'Risk',
        likelihood: 'Likelihood',
        impact: 'Impact',
        mitigation: 'Mitigation',
        low: 'Low',
        medium: 'Medium',
        high: 'High',
        highlight: 'Priority risk',
      },
      risks: [
        {
          name: 'Late stock',
          likelihood: 'low',
          impact: 'medium',
          mitigation: 'Reserve trees with two local nurseries',
        },
        {
          name: 'Warden turnover',
          likelihood: 'medium',
          impact: 'low',
          mitigation: 'Pair each new warden with a neighbour',
        },
        {
          name: 'Summer drought',
          likelihood: 'high',
          impact: 'high',
          mitigation: 'Fund a weekly watering crew',
          highlight: true,
        },
      ],
    },
    body: [
      'Every planting district has a mitigation before the season opens.',
      '',
      '<Footnote>Assessment for the 2027 planting season.</Footnote>',
      '',
      '<Notes>',
      'Watering has the highest likelihood and impact. The funded crew is the decision today.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
