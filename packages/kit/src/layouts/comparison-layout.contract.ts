import { defineLayoutContract, type FieldProblem } from '@deckster/engine/layout';
import { Effect, Schema } from 'effect';

import {
  CHROME_HINT,
  chromeField,
  EYEBROW_HINT,
  EyebrowField,
  REVEAL_HINT,
  RevealField,
  textField,
} from '#layouts/layout-fields.ts';

/**
 * The fewest options a comparison sets side by side.
 */
export const MIN_OPTIONS = 2;

/**
 * The most options a comparison sets side by side; more belong in a table.
 */
export const MAX_OPTIONS = 3;

/**
 * The fewest rows a comparison measures the options on.
 */
export const MIN_ROWS = 2;

/**
 * The most rows a comparison measures the options on.
 */
export const MAX_ROWS = 5;

/**
 * The longest option name, in characters: two lines at the title step in a third of the row.
 */
export const OPTION_NAME_MAX_CHARS = 24;

/**
 * The longest option summary, in characters: two lines under the name.
 */
export const OPTION_SUMMARY_MAX_CHARS = 36;

/**
 * The longest row label, in characters: two lines in the label column.
 */
export const ROW_LABEL_MAX_CHARS = 24;

/**
 * The longest value, in characters: two lines in an option's column of three.
 */
export const VALUE_MAX_CHARS = 28;

/**
 * The longest value with three options, in characters: two lines in a quarter of the row.
 */
export const VALUE_MAX_CHARS_IN_THREE = 20;

/**
 * The longest option summary with three options, in characters.
 */
export const OPTION_SUMMARY_MAX_CHARS_IN_THREE = 24;

/**
 * The longest row label with three options, in characters: one line in a quarter of the row.
 */
export const ROW_LABEL_MAX_CHARS_IN_THREE = 18;

/**
 * The longest badge over the recommended option, in characters: one line of label type.
 */
export const BADGE_MAX_CHARS = 20;

/**
 * The badge over the recommended option when the slide names none.
 */
export const DEFAULT_BADGE = 'Recommended';

/**
 * The longest comparison title, in characters: one line, so six rows fit under it.
 */
export const COMPARISON_TITLE_MAX_CHARS = 50;

/**
 * One option: its name, a line on what it is, and whether it is the one recommended.
 */
const ComparisonOption = Schema.Struct({
  name: textField(OPTION_NAME_MAX_CHARS, 'an option name'),
  summary: Schema.optionalKey(textField(OPTION_SUMMARY_MAX_CHARS, 'an option summary')),
  recommended: Schema.optionalKey(Schema.Boolean),
});

/**
 * One value of a row: text, or `true` / `false` for a check or a dash.
 */
const ComparisonValue = Schema.Union([Schema.Boolean, textField(VALUE_MAX_CHARS, 'a value')]);

/**
 * One row: what the options are measured on, each option's value in the options' order, and
 * optionally the number of the option that wins the row.
 */
const ComparisonRow = Schema.Struct({
  label: textField(ROW_LABEL_MAX_CHARS, 'a row label'),
  winner: Schema.optionalKey(
    Schema.Int.check(
      Schema.isBetween(
        { minimum: 1, maximum: MAX_OPTIONS },
        { message: `Expected a winner from 1 to ${MAX_OPTIONS}, the number of an option` },
      ),
    ),
  ),
  values: Schema.Array(ComparisonValue).check(
    Schema.isMinLength(MIN_OPTIONS, { message: `Expected a value for each option` }),
    Schema.isMaxLength(MAX_OPTIONS, { message: `Expected at most ${MAX_OPTIONS} values` }),
  ),
});

/**
 * One option as a slide's frontmatter writes it, decoded.
 */
export type ComparisonOptionEntry = typeof ComparisonOption.Type;

/**
 * One row as a slide's frontmatter writes it, decoded.
 */
export type ComparisonRowEntry = typeof ComparisonRow.Type;

/**
 * What the schema cannot check field by field: every row holds one value per option, in the
 * options' order, and at most one option is recommended.
 *
 * @param options - The decoded options.
 * @param rows - The decoded rows.
 * @returns The problems, each with its field path.
 */
export function comparisonProblems(
  options: readonly ComparisonOptionEntry[],
  rows: readonly ComparisonRowEntry[],
): FieldProblem[] {
  const problems: FieldProblem[] = rows.flatMap((row, index) => {
    if (row.values.length === options.length) {
      return [];
    }

    const plural = row.values.length === 1 ? '' : 's';
    return [
      {
        path: `rows[${index}].values`,
        message:
          `Row "${row.label}" has ${row.values.length} value` +
          `${plural} for ${options.length} options.`,
        fix:
          `Give the row one value per option, in the order of \`options\` ` +
          `(${options.map((option) => option.name).join(', ')}); write false for a dash.`,
      },
    ];
  });
  rows.forEach((row, index) => {
    if (row.winner !== undefined && row.winner > options.length) {
      problems.push({
        path: `rows[${index}].winner`,
        message:
          `Row "${row.label}" names option ${row.winner} as its winner, but there are ` +
          `${options.length} options.`,
        fix:
          `Write the number of one option, 1 to ${options.length} in the order of \`options\` ` +
          `(${options.map((option, at) => `${at + 1} is ${option.name}`).join(', ')}), or leave ` +
          '`winner` out.',
      });
    }
  });
  const recommended = options.flatMap((option, index) =>
    option.recommended === true ? [index] : [],
  );
  if (recommended.length > 1) {
    problems.push({
      path: 'options',
      message:
        `${recommended.length} options are recommended ` +
        `(${recommended.map((index) => options[index]?.name ?? '').join(', ')}); a comparison ` +
        'recommends at most one.',
      fix:
        'Keep `recommended: true` on the one option you recommend and remove it from the ' +
        'others.',
    });
  }

  return problems;
}

/**
 * The contract of the `comparison` layout: two or three options measured on the same rows.
 */
export const comparisonLayoutContract = defineLayoutContract({
  name: 'comparison',
  description:
    'Two or three options side by side, measured on the same two to five rows: before and after, ' +
    'us and them, or the options of a decision, from `options:` and `rows:` in the frontmatter. ' +
    'Each row has a label and one value per option (text, or true and false for a check and a ' +
    'dash) and may name its `winner`, the number of the option that wins that row, which is ' +
    'drawn bold with a diamond. Mark the option you recommend with `recommended: true`: its column is set on a panel ' +
    'with an accent rule under a badge (`badge:`, "Recommended" by default). `reveal: true` adds ' +
    'one option per click. Use stats when each option is one number, a table for more than three ' +
    'options or five rows, and cards for ideas that are not alternatives.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    options: Schema.Array(ComparisonOption).check(
      Schema.isMinLength(MIN_OPTIONS, { message: `Expected at least ${MIN_OPTIONS} options` }),
      Schema.isMaxLength(MAX_OPTIONS, { message: `Expected at most ${MAX_OPTIONS} options` }),
    ),
    rows: Schema.Array(ComparisonRow).check(
      Schema.isMinLength(MIN_ROWS, { message: `Expected at least ${MIN_ROWS} rows` }),
      Schema.isMaxLength(MAX_ROWS, { message: `Expected at most ${MAX_ROWS} rows` }),
    ),
    badge: textField(BADGE_MAX_CHARS, 'a badge').pipe(
      Schema.withDecodingDefaultKey(Effect.succeed(DEFAULT_BADGE)),
    ),
    reveal: RevealField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    options:
      `List ${MIN_OPTIONS} or ${MAX_OPTIONS} options in the order of their columns, each with ` +
      `\`name\` (up to ${OPTION_NAME_MAX_CHARS} characters) and optionally \`summary\` (up to ` +
      `${OPTION_SUMMARY_MAX_CHARS}, ${OPTION_SUMMARY_MAX_CHARS_IN_THREE} with three options) and ` +
      '`recommended: true` on the one you recommend.',
    rows:
      `List ${MIN_ROWS} to ${MAX_ROWS} rows, each with \`label\` (up to ${ROW_LABEL_MAX_CHARS} ` +
      `characters, ${ROW_LABEL_MAX_CHARS_IN_THREE} with three options) and \`values\`, one per ` +
      `option (${MIN_OPTIONS} or ${MAX_OPTIONS}) in the same order: text (up to ` +
      `${VALUE_MAX_CHARS}, ${VALUE_MAX_CHARS_IN_THREE} with three options), or true and false ` +
      'for a check and a dash. Add `winner: 2` to a row to mark the option that wins it ' +
      '(1 to the number of options, in the order of `options`), drawn bold with a diamond in ' +
      'that cell; set it on the rows the recommended option loses too, so the slide is honest ' +
      'about the trade.',
    badge:
      `Write the word over the recommended option, up to ${BADGE_MAX_CHARS} characters, such as ` +
      '`badge: Our pick` or `badge: Empfohlen`; it defaults to "Recommended".',
    reveal: REVEAL_HINT,
    chrome: CHROME_HINT,
  },
  checks: (frontmatter) => comparisonProblems(frontmatter.options, frontmatter.rows),
  title: { required: true, maxChars: COMPARISON_TITLE_MAX_CHARS },
  slots: {
    footnote: {
      description: 'A source or caveat on the bottom line.',
      accepts: ['text'],
    },
  },
  budget: {
    footnote: { maxWords: 24 },
  },
  variants: [
    {
      name: 'three options',
      when: { counts: { options: MAX_OPTIONS } },
      budget: {},
      // Four columns (labels and three options) leave each value a quarter of the row.
      fields: {
        'options[].summary': { maxChars: OPTION_SUMMARY_MAX_CHARS_IN_THREE },
        'rows[].label': { maxChars: ROW_LABEL_MAX_CHARS_IN_THREE },
        'rows[].values[]': { maxChars: VALUE_MAX_CHARS_IN_THREE },
      },
    },
  ],
  pptx: {
    type: 'title-only',
    placeholders: [{ kind: 'title', from: { selector: '.kit-title' } }],
  },
  example: {
    frontmatter: {
      title: 'Large trees cost more and cool far more',
      eyebrow: 'The species choice',
      options: [
        { name: 'Ornamental pear', summary: 'Planted across the city since 2005' },
        { name: 'London plane', summary: 'What the plan proposes', recommended: true },
      ],
      rows: [
        { label: 'Cost to plant', values: ['$1,900', '$4,600'], winner: 1 },
        { label: 'Crown at 20 years', values: ['30 m²', '240 m²'], winner: 2 },
        { label: 'Survives a dry summer', values: [false, true], winner: 2 },
      ],
    },
    body: [
      '<Footnote>Costs include the soil cells; crowns from the Larkfield tree survey.</Footnote>',
      '',
      '<Notes>',
      'The plane costs two and a half times as much and shades eight times the ground.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
