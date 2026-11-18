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
import { splitStat } from '#layouts/stat-value.ts';

/**
 * The fewest nested market sizes: the whole and the part within reach.
 */
export const MIN_MARKET_SIZES = 2;

/**
 * The most nested sizes: total, serviceable and obtainable.
 */
export const MAX_MARKET_SIZES = 3;

/**
 * The longest label for a market size, in characters.
 */
export const MARKET_LABEL_MAX_CHARS = 20;

/**
 * The longest displayed figure, including currency prefix and unit suffix, in characters.
 */
export const MARKET_VALUE_MAX_CHARS = 8;

/**
 * The longest one-line explanation of a market size, in characters.
 */
export const MARKET_NOTE_MAX_CHARS = 40;

/**
 * The longest title: one line above the nested sizes.
 */
export const MARKET_TITLE_MAX_CHARS = 50;

/**
 * The longest share template and minimum-marker label, before figure substitution.
 */
export const MARKET_SHARE_LABEL_MAX_CHARS = 24;

/**
 * Default wording for parent shares and markers enlarged for visibility.
 */
export const DEFAULT_MARKET_LABELS = {
  /**
   * Share placeholders are replaced with the percentage and the enclosing market's figure.
   */
  share: '{share} of {parent}',

  /**
   * Explicit disclosure when a marker is larger than its proportional area.
   */
  minimum: 'Marker enlarged',
} as const;

/**
 * The source and qualification on the bottom line, in words.
 */
const MARKET_FOOTNOTE_MAX_WORDS = 16;

/**
 * One size, listed outermost first. Figures use the kit's currency and unit conventions.
 */
const MarketSize = Schema.Struct({
  label: textField(MARKET_LABEL_MAX_CHARS, 'a market label'),
  value: Schema.Union([Schema.Finite, textField(MARKET_VALUE_MAX_CHARS, 'a market figure')]),
  note: textField(MARKET_NOTE_MAX_CHARS, 'a market note'),
});

/**
 * One market size as the slide writes it, decoded.
 */
export type MarketSizeEntry = typeof MarketSize.Type;

/**
 * A market figure converted to its base unit, without changing its displayed precision.
 */
type MarketAmount = {
  /**
   * The positive quantity after expanding its compact magnitude.
   */
  amount: number;

  /**
   * The currency prefix, or empty for unitless counts.
   */
  unit: string;
};

/**
 * Exact positive numbers, with optional thousands separators and a decimal point.
 */
const MARKET_NUMBER_PATTERN = /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/u;

/**
 * Compact magnitudes understood by the proportional drawing.
 */
const MARKET_MAGNITUDES: ReadonlyMap<string, number> = new Map([
  ['', 1],
  ['k', 1_000],
  ['K', 1_000],
  ['M', 1_000_000],
  ['B', 1_000_000_000],
  ['T', 1_000_000_000_000],
]);

/**
 * Reads the same currency prefix and compact suffix that StatValue displays. Ranges, approximations
 * and unknown suffixes cannot determine an area and are rejected.
 *
 * @param value - A positive number or displayed figure such as `€3.0B` or `$640k`.
 */
export function marketAmount(value: string | number): MarketAmount | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? { amount: value, unit: '' } : undefined;
  }

  const { prefix, number, suffix } = splitStat(value);
  const magnitude = MARKET_MAGNITUDES.get(suffix);
  if (!MARKET_NUMBER_PATTERN.test(number) || magnitude === undefined) {
    return undefined;
  }

  const amount = Number(number.replaceAll(',', '')) * magnitude;
  return Number.isFinite(amount) && amount > 0 ? { amount, unit: prefix } : undefined;
}

/**
 * Keeps measurable nesting meaningful: comparable positive figures in one unit, largest first.
 * Other kit figure formats remain valid and take the typographic ladder.
 *
 * @param sizes - The market scopes in the order written by the author.
 */
export function marketProblems(sizes: readonly MarketSizeEntry[]): FieldProblem[] {
  const problems: FieldProblem[] = [];
  let previous: MarketAmount | undefined;
  for (const [index, size] of sizes.entries()) {
    const current = marketAmount(size.value);
    if (current !== undefined && previous !== undefined && current.unit !== previous.unit) {
      problems.push({
        path: `sizes.${index}.value`,
        message: 'Nested market figures must use the same currency or unit.',
        fix: 'Write every size in the same unit; compact magnitudes may differ.',
      });
    } else if (
      current !== undefined &&
      previous !== undefined &&
      current.amount > previous.amount
    ) {
      problems.push({
        path: `sizes.${index}.value`,
        message: 'A nested market cannot be larger than its parent.',
        fix: 'List sizes from the whole market to the smallest part within it.',
      });
    }

    previous = current;
  }

  return problems;
}

/**
 * The contract of the `market` layout: nested scopes with aligned figures and explanations.
 */
export const marketLayoutContract = defineLayoutContract({
  name: 'market',
  description:
    'Two or three nested market sizes from `sizes:`, outermost first, each with a label, a ' +
    'figure and a one-line note. Bottom-aligned nested circles on the left encode the figures ' +
    'by area; label, figure and note stack consistently beside them. The innermost circle and ' +
    'figure, the part you can win, carry the accent. Very small circles keep a minimum visible ' +
    'diameter, a labelled share of their parent, and an explicit "Marker enlarged" disclosure. ' +
    '`labels.share` and `labels.minimum` override that wording. Close or equal scopes, and figures that cannot determine ' +
    'an exact area, use a typographic ladder instead. ' +
    '`reveal: true` introduces each size from the outside in. Use it to distinguish total, ' +
    'serviceable and obtainable demand, or a whole market and a reachable segment. Use ' +
    'equation when the audience needs to check the market arithmetic, stats for independent ' +
    'figures without nesting, and a chart for a longer quantitative series.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    sizes: Schema.Array(MarketSize).check(
      Schema.isMinLength(MIN_MARKET_SIZES, {
        message: `Expected at least ${MIN_MARKET_SIZES} market sizes`,
      }),
      Schema.isMaxLength(MAX_MARKET_SIZES, {
        message: `Expected at most ${MAX_MARKET_SIZES} market sizes`,
      }),
    ),
    labels: Schema.Struct({
      share: textField(MARKET_SHARE_LABEL_MAX_CHARS, 'a share label template').pipe(
        Schema.withDecodingDefaultKey(Effect.succeed(DEFAULT_MARKET_LABELS.share)),
      ),
      minimum: textField(MARKET_SHARE_LABEL_MAX_CHARS, 'an enlarged marker label').pipe(
        Schema.withDecodingDefaultKey(Effect.succeed(DEFAULT_MARKET_LABELS.minimum)),
      ),
    }).pipe(Schema.withDecodingDefaultKey(Effect.succeed(DEFAULT_MARKET_LABELS))),
    reveal: RevealField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    sizes:
      `List ${MIN_MARKET_SIZES} to ${MAX_MARKET_SIZES} sizes, outermost first, each with ` +
      `\`label\` (up to ${MARKET_LABEL_MAX_CHARS} characters), \`value\` (a number or a figure ` +
      `as shown, up to ${MARKET_VALUE_MAX_CHARS} characters including prefix and suffix, such ` +
      `as "€3.0B") and \`note\` (one line, up to ${MARKET_NOTE_MAX_CHARS} characters). ` +
      'For proportional circles use exact positive figures in the same currency or unit, ' +
      'largest first; compact ' +
      'magnitudes k, M, B and T and comma thousands separators are supported. The last size ' +
      'is the part you can win. Circle areas are proportional, with a labelled minimum for ' +
      'very small values. Close or equal scopes and other figure formats use a typographic ladder.',
    reveal: REVEAL_HINT,
    labels:
      `Optional share and minimum labels, each up to ${MARKET_SHARE_LABEL_MAX_CHARS} characters. ` +
      '`share` defaults to "{share} of {parent}"; keep those placeholders for the exact ' +
      'percentage and enclosing figure. `minimum` defaults to "Marker enlarged" and discloses ' +
      'a circle held above its proportional size for visibility.',
    chrome: CHROME_HINT,
  },
  checks: (frontmatter) => marketProblems(frontmatter.sizes),
  title: { required: true, maxChars: MARKET_TITLE_MAX_CHARS },
  slots: {
    body: {
      description: 'One sentence under the title defining the market or its common unit.',
      accepts: ['text'],
    },
    footnote: {
      description: 'The source, date or qualification of the market figures, on the bottom line.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: CONTEXT_MAX_WORDS },
    footnote: { maxWords: MARKET_FOOTNOTE_MAX_WORDS },
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
      title: 'Schools are our first reachable market',
      eyebrow: 'Annual tree care',
      sizes: [
        { label: 'TAM', value: '$18M', note: 'All public tree care in the county' },
        { label: 'SAM', value: '$4.2M', note: 'Sites within reach of our crews' },
        { label: 'SOM', value: '$640k', note: 'School contracts we can win this year' },
      ],
    },
    body: [
      'All figures are annual contract value.',
      '',
      '<Footnote>County procurement register, 2026. Annual contract values.</Footnote>',
      '',
      '<Notes>',
      'Start with the county, then narrow to our crews and the schools we can serve first.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
