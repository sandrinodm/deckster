import { defineLayoutContract, type FieldProblem } from '@deckster/engine/layout';
import { Effect, Schema } from 'effect';

import {
  CHROME_HINT,
  chromeField,
  EYEBROW_HINT,
  EyebrowField,
  IconNameField,
  REVEAL_HINT,
  RevealField,
  textField,
} from '#layout-fields.ts';

/**
 * The number of boxes in a two-by-two board, in reading order.
 */
export const QUADRANT_COUNT = 4;

/**
 * The fewest bullets in each box.
 */
export const MIN_QUADRANT_ITEMS = 1;

/**
 * The most bullets in each box; longer lists belong on separate slides.
 */
export const MAX_QUADRANT_ITEMS = 4;

/**
 * The longest box heading, in characters.
 */
export const QUADRANT_TITLE_MAX_CHARS = 24;

/**
 * The longest bullet, in characters, in a half-width box.
 */
export const QUADRANT_ITEM_MAX_CHARS = 40;

/**
 * The longest slide title, in characters, held to one line to leave room for both rows.
 */
export const QUADRANTS_TITLE_MAX_CHARS = 50;

/**
 * The most words in the context line, leaving room for both rows in wider typefaces.
 */
export const QUADRANTS_CONTEXT_MAX_WORDS = 10;

/**
 * The most words on the bottom source or caveat line.
 */
export const QUADRANTS_FOOTNOTE_MAX_WORDS = 10;

/**
 * The longest screen-reader prefix of the highlighted box's heading, in characters; it is never
 * drawn.
 */
export const QUADRANTS_HIGHLIGHT_LABEL_MAX_CHARS = 24;

/**
 * The English screen-reader prefix used when the author gives no `labels`.
 */
const DEFAULT_QUADRANTS_LABELS = {
  /**
   * Read before the highlighted box's heading, followed by a colon.
   */
  highlight: 'Highlighted',
} as const;

/**
 * Optional replacement for the highlighted box's screen-reader prefix.
 */
const Labels = Schema.Struct({
  highlight: textField(QUADRANTS_HIGHLIGHT_LABEL_MAX_CHARS, 'a highlight label').pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(DEFAULT_QUADRANTS_LABELS.highlight)),
  ),
});

/**
 * Author-supplied highlight prefix; an omitted key keeps the English default.
 */
export type QuadrantsLabels = typeof Labels.Type;

/**
 * One labelled box with its own short bullet list and an optional decorative icon.
 */
const Quadrant = Schema.Struct({
  title: textField(QUADRANT_TITLE_MAX_CHARS, 'a quadrant title'),
  items: Schema.Array(textField(QUADRANT_ITEM_MAX_CHARS, 'a quadrant item')).check(
    Schema.isMinLength(MIN_QUADRANT_ITEMS, {
      message: `Expected at least ${MIN_QUADRANT_ITEMS} item in a quadrant`,
    }),
    Schema.isMaxLength(MAX_QUADRANT_ITEMS, {
      message: `Expected at most ${MAX_QUADRANT_ITEMS} items in a quadrant`,
    }),
  ),
  icon: Schema.optionalKey(IconNameField),
  highlight: Schema.optionalKey(Schema.Boolean),
});

/**
 * One decoded box from a slide's frontmatter.
 */
export type QuadrantEntry = typeof Quadrant.Type;

/**
 * Rejects boards that emphasize more than one category.
 *
 * @param quadrants - The four decoded lists in reading order.
 * @returns A field problem for multiple highlighted boxes, otherwise an empty list.
 */
export function quadrantsProblems(quadrants: readonly QuadrantEntry[]): FieldProblem[] {
  const highlighted = quadrants.filter((quadrant) => quadrant.highlight === true);
  if (highlighted.length <= 1) {
    return [];
  }

  return [
    {
      path: 'quadrants',
      message: `${highlighted.length} quadrants are highlighted; a board highlights at most one.`,
      fix:
        'Keep `highlight: true` on the category that matters most ' +
        'and remove it from the others.',
    },
  ];
}

/**
 * Four labelled lists in a two-by-two grid for a SWOT or a four-part retrospective.
 */
export const quadrantsLayoutContract = defineLayoutContract({
  name: 'quadrants',
  description:
    'Four named lists in a full-height, ruled two-by-two grid, from `quadrants:` ' +
    'in reading order: top left, ' +
    'top right, bottom left, bottom right. Each box has a `title`, one to four short `items` ' +
    'as bullets and an optional `icon` from the brand set. Set `highlight: true` on at most ' +
    'one quadrant to give it a nested surface and an accessible highlight label; the headings and bullets ' +
    'identify each category without colour. `reveal: true` brings in one whole box per click. ' +
    'Use it for SWOT, keep/stop/start/try, or any four categories that each need their own ' +
    'list. Use matrix when items are positions on two axes, columns for a board of two to ' +
    'four lanes, cards for equal options with one sentence each, and comparison when options ' +
    'are measured on the same rows. `labels.highlight` renames the prefix screen readers hear ' +
    'before the highlighted heading, for example `labels: { highlight: Priorität }`.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    quadrants: Schema.Array(Quadrant).check(
      Schema.isMinLength(QUADRANT_COUNT, {
        message: `Expected exactly ${QUADRANT_COUNT} quadrants`,
      }),
      Schema.isMaxLength(QUADRANT_COUNT, {
        message: `Expected exactly ${QUADRANT_COUNT} quadrants`,
      }),
    ),
    labels: Labels.pipe(
      Schema.withDecodingDefaultKey(Effect.succeed({ ...DEFAULT_QUADRANTS_LABELS })),
    ),
    reveal: RevealField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    quadrants:
      `List exactly ${QUADRANT_COUNT} boxes in reading order, each with ` +
      `\`title\` (up to ${QUADRANT_TITLE_MAX_CHARS} characters), \`items\` ` +
      `(${MIN_QUADRANT_ITEMS} to ${MAX_QUADRANT_ITEMS} bullets, each up to ` +
      `${QUADRANT_ITEM_MAX_CHARS} characters), and optionally \`icon\` (a name from the ` +
      'brand set, such as leaf, or tabler:leaf). Give an icon to all four boxes or to none. ' +
      'Set `highlight: true` on at most one box to emphasize it, or omit it for equal weight.',
    labels:
      'An optional replacement for `highlight` (Highlighted), the screen-reader prefix of the ' +
      `highlighted box's heading, 1 to ${QUADRANTS_HIGHLIGHT_LABEL_MAX_CHARS} characters; it is ` +
      'never drawn. An omitted key keeps its English default. For example, ' +
      '`labels: { highlight: Priorität }`.',
    reveal: REVEAL_HINT,
    chrome: CHROME_HINT,
  },
  checks: (frontmatter) => quadrantsProblems(frontmatter.quadrants),
  title: { required: true, maxChars: QUADRANTS_TITLE_MAX_CHARS },
  slots: {
    body: {
      description:
        'One sentence under the title framing the four lists. Put the lists in `quadrants:`.',
      accepts: ['text'],
    },
    footnote: {
      description: 'A source or caveat on the bottom line.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: QUADRANTS_CONTEXT_MAX_WORDS },
    footnote: { maxWords: QUADRANTS_FOOTNOTE_MAX_WORDS },
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
      title: 'Keep the care that makes new trees survive',
      eyebrow: 'Season review',
      labels: { ...DEFAULT_QUADRANTS_LABELS },
      quadrants: [
        {
          title: 'Keep',
          items: ['Three summers of watering', 'A named street warden'],
        },
        { title: 'Stop', items: ['Planting without a care budget'] },
        {
          title: 'Start',
          items: ['Weekly checks in dry spells'],
          highlight: true,
        },
        { title: 'Try', items: ['Shared hose carts on each block'] },
      ],
    },
    body: [
      'The next planting season starts with a funded care plan.',
      '',
      '<Footnote>Programme team review of the 2026 season.</Footnote>',
      '',
      '<Notes>',
      'Read keep and stop first, then the two actions for the next season.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
