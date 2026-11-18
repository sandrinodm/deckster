import { defineLayoutContract, type FieldProblem } from '@deckster/engine/layout';
import { Schema } from 'effect';

import {
  CHROME_HINT,
  chromeField,
  CONTEXT_MAX_WORDS,
  EYEBROW_HINT,
  EyebrowField,
  IconNameField,
  RevealField,
  textField,
} from '#layouts/layout-fields.ts';

/**
 * The fewest capabilities in a features grid; fewer belong in cards.
 */
export const MIN_FEATURES = 6;

/**
 * The most capabilities in a features grid; longer inventories belong in a table.
 */
export const MAX_FEATURES = 12;

/**
 * The most capabilities that may include details, keeping the detail at small type or larger.
 */
export const MAX_FEATURES_WITH_DETAILS = 9;

/**
 * The longest capability title, in characters.
 */
export const FEATURE_TITLE_MAX_CHARS = 22;

/**
 * The longest optional capability detail, in characters.
 */
export const FEATURE_DETAIL_MAX_CHARS = 28;

/**
 * The first count that needs three rows and shorter text.
 */
export const FEATURES_DENSE_FROM = 9;

/**
 * The longest title in a three-row grid, in characters.
 */
export const FEATURE_TITLE_MAX_CHARS_DENSE = 14;

/**
 * The longest slide title, in characters, kept on one line above the grid.
 */
export const FEATURES_TITLE_MAX_CHARS = 50;

/**
 * One capability: an icon from the brand set, a title and an optional few words of detail.
 */
const Feature = Schema.Struct({
  icon: IconNameField,
  title: textField(FEATURE_TITLE_MAX_CHARS, 'a feature title'),
  detail: Schema.optionalKey(textField(FEATURE_DETAIL_MAX_CHARS, 'a feature detail')),
});

/**
 * A decoded capability from a slide's features list.
 */
export type FeatureEntry = typeof Feature.Type;

/**
 * Prevents dense inventories from shrinking optional details into fine print.
 */
export function featuresProblems(features: readonly FeatureEntry[]): FieldProblem[] {
  if (
    features.length <= MAX_FEATURES_WITH_DETAILS ||
    features.every((item) => item.detail === undefined)
  ) {
    return [];
  }

  return [
    {
      path: 'features',
      message: `Details are supported for at most ${MAX_FEATURES_WITH_DETAILS} features.`,
      fix: 'Remove details from every item, or split the inventory across slides.',
    },
  ];
}

/**
 * The contract of the features layout: a compact inventory of six to twelve peer capabilities.
 */
export const featuresLayoutContract = defineLayoutContract({
  name: 'features',
  description:
    'Six to twelve capabilities in an open grid, from `features:` in the frontmatter, each ' +
    'with an icon from the brand set, a short `title` and an optional few-word `detail`. ' +
    'Six or nine items take three columns; seven, eight and ten to twelve take four. ' +
    'Details are supported for six to nine items; ten to twelve use icons and titles only. ' +
    'Icons sit above titles, or beside the text in the nine-item detailed grid. ' +
    'There are no panels around the items, so the grid reads as one compact inventory under ' +
    'a title that states the point. ' +
    'Use it for a product capability overview or a checklist of what a service includes. Use ' +
    'cards for two to four ideas that need more explanation, steps for a sequence, and ' +
    'comparison or table when capabilities must be measured across alternatives. ' +
    '`reveal: true` brings in one complete row per click, keeping its final space throughout.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    features: Schema.Array(Feature).check(
      Schema.isMinLength(MIN_FEATURES, { message: `Expected at least ${MIN_FEATURES} features` }),
      Schema.isMaxLength(MAX_FEATURES, { message: `Expected at most ${MAX_FEATURES} features` }),
    ),
    reveal: RevealField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    features:
      `List ${MIN_FEATURES} to ${MAX_FEATURES} features, each with a required \`icon\` (a name ` +
      'in the brand icon set, such as leaf), ' +
      `\`title\` (up to ${FEATURE_TITLE_MAX_CHARS} characters) and optional \`detail\` ` +
      `(up to ${FEATURE_DETAIL_MAX_CHARS} characters). With ${FEATURES_DENSE_FROM} to ` +
      `${MAX_FEATURES} features, titles are limited to ${FEATURE_TITLE_MAX_CHARS_DENSE} ` +
      'characters. Use icon names available in ' +
      "every brand of the deck's sets. " +
      `With ${MAX_FEATURES_WITH_DETAILS + 1} to ${MAX_FEATURES} features, omit details.`,
    reveal:
      'Write `reveal: true` to show one complete row per step, in reading order, or leave it ' +
      'out to show the whole grid at once.',
    chrome: CHROME_HINT,
  },
  checks: (frontmatter) => featuresProblems(frontmatter.features),
  title: { required: true, maxChars: FEATURES_TITLE_MAX_CHARS },
  slots: {
    body: {
      description: 'One sentence on what the capabilities have in common. Put them in `features:`.',
      accepts: ['text'],
    },
    footnote: {
      description: 'A source or caveat on the bottom line.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: CONTEXT_MAX_WORDS },
    footnote: { maxWords: 16 },
  },
  variants: [
    {
      name: 'three rows',
      when: { counts: { features: { min: FEATURES_DENSE_FROM, max: MAX_FEATURES } } },
      budget: {},
      fields: { 'features[].title': { maxChars: FEATURE_TITLE_MAX_CHARS_DENSE } },
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
      title: 'Tree care reaches beyond planting day',
      features: [
        { icon: 'map-pin', title: 'Survey' },
        { icon: 'trees', title: 'Planting' },
        { icon: 'droplets', title: 'Watering' },
        { icon: 'shield', title: 'Protection' },
        { icon: 'users', title: 'Wardens' },
        { icon: 'chart-bar', title: 'Reporting' },
      ],
    },
    body: [
      'Every new tree receives the same care.',
      '',
      '<Notes>',
      '`features` with six capabilities; use it for a compact overview of one service.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
