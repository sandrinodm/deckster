import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import {
  CHROME_HINT,
  chromeField,
  CONTEXT_MAX_WORDS,
  EYEBROW_HINT,
  EyebrowField,
  IconNameField,
  REVEAL_HINT,
  RevealField,
  textField,
} from '#layout-fields.ts';

/**
 * The fewest cards a cards slide shows.
 */
export const MIN_CARDS = 2;

/**
 * The most cards a cards slide shows; more belong in a table or a list.
 */
export const MAX_CARDS = 4;

/**
 * The longest card title, in characters: two lines in a third of the row.
 */
export const CARD_TITLE_MAX_CHARS = 28;

/**
 * The longest card text, in characters: four lines in a third of the row.
 */
export const CARD_TEXT_MAX_CHARS = 56;

/**
 * The longest card title in a row of four, in characters: two lines in a quarter of the row.
 */
export const CARD_TITLE_MAX_CHARS_IN_FOUR = 22;

/**
 * The longest card text in a row of four, in characters: four lines in a quarter of the row.
 */
export const CARD_TEXT_MAX_CHARS_IN_FOUR = 44;

/**
 * The longest cards title, in characters: two lines at the smallest fit step.
 */
export const CARDS_TITLE_MAX_CHARS = 60;

/**
 * One card: an icon, a short title and a line or two of text.
 */
const Card = Schema.Struct({
  icon: Schema.optionalKey(IconNameField),
  title: textField(CARD_TITLE_MAX_CHARS, 'a card title'),
  text: Schema.optionalKey(textField(CARD_TEXT_MAX_CHARS, 'a card text')),
});

/**
 * One card as a slide's frontmatter writes it, decoded.
 */
export type CardEntry = typeof Card.Type;

/**
 * The contract of the `cards` layout: two to four parallel ideas, each a card with an icon.
 */
export const cardsLayoutContract = defineLayoutContract({
  name: 'cards',
  description:
    'Two to four parallel ideas of equal weight (pillars, options, principles), each a ' +
    'card with an icon from the brand set, a short title and a line or two of text, from ' +
    '`cards:` in the frontmatter. The cards share the row and the height under the title. Use ' +
    'it when the ideas are peers; use steps when they happen in order, stats when each is a ' +
    'number, comparison when they are alternatives measured on the same rows, and content for ' +
    'a list. `reveal: true` shows them one per step; ' +
    'use features for six to twelve capabilities, quadrants for four boxes, faq for questions and answers, or recap for takeaways.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    cards: Schema.Array(Card).check(
      Schema.isMinLength(MIN_CARDS, { message: `Expected at least ${MIN_CARDS} cards` }),
      Schema.isMaxLength(MAX_CARDS, { message: `Expected at most ${MAX_CARDS} cards` }),
    ),
    reveal: RevealField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    cards:
      `List ${MIN_CARDS} to ${MAX_CARDS} cards, each with \`title\` (up to ` +
      `${CARD_TITLE_MAX_CHARS} characters, ${CARD_TITLE_MAX_CHARS_IN_FOUR} in a row of four) and ` +
      `optionally \`text\` (up to ${CARD_TEXT_MAX_CHARS}, ${CARD_TEXT_MAX_CHARS_IN_FOUR} in a ` +
      'row of four) and `icon` (a name in the brand icon set, such as leaf; use names every ' +
      "brand of the deck's sets has).",
    reveal: REVEAL_HINT,
    chrome: CHROME_HINT,
  },
  title: { required: true, maxChars: CARDS_TITLE_MAX_CHARS },
  slots: {
    body: {
      description:
        'One sentence under the title on what the cards have in common. Put the ideas in ' +
        '`cards:`, not here.',
      accepts: ['text'],
    },
    footnote: {
      description: 'A source or caveat on the bottom line.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: CONTEXT_MAX_WORDS },
    footnote: { maxWords: 24 },
  },
  variants: [
    {
      name: 'four cards',
      when: { counts: { cards: MAX_CARDS } },
      budget: {},
      // A quarter of the row leaves each card fewer characters a line.
      fields: {
        'cards[].title': { maxChars: CARD_TITLE_MAX_CHARS_IN_FOUR },
        'cards[].text': { maxChars: CARD_TEXT_MAX_CHARS_IN_FOUR },
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
      title: 'Three rules decide where a tree goes',
      eyebrow: 'Planting principles',
      cards: [
        {
          icon: 'thermometer',
          title: 'Hottest blocks first',
          text: 'Rank blocks by July surface heat; plant from the top.',
        },
        {
          icon: 'trees',
          title: 'Large species only',
          text: 'Plane, oak and lime: crowns that shade the road.',
        },
        {
          icon: 'droplets',
          title: 'Three summers of care',
          text: 'Water, mulch and check every tree for three years.',
        },
      ],
    },
    body: [
      'Every block in the plan passes all three.',
      '',
      '<Notes>',
      'Say the three rules, then say they come from the pilot: we broke each one once.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
