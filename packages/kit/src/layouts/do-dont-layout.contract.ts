import { defineLayoutContract } from '@deckster/engine/layout';
import { Effect, Schema } from 'effect';

import {
  CHROME_HINT,
  chromeField,
  CONTEXT_MAX_WORDS,
  EYEBROW_HINT,
  EyebrowField,
  RevealField,
  textField,
} from '#layout-fields.ts';

/**
 * The fewest examples on either side; a single contrast belongs in shift.
 */
export const MIN_DO_DONT_ITEMS = 2;

/**
 * The most examples on either side, leaving each one room to read aloud.
 */
export const MAX_DO_DONT_ITEMS = 4;

/**
 * The longest example in characters, including spaces and punctuation.
 */
export const DO_DONT_ITEM_MAX_CHARS = 56;

/**
 * The longest column heading in characters, at the brand's title step.
 */
export const DO_DONT_LABEL_MAX_CHARS = 24;

/**
 * The longest slide title in characters, fitted to one line above the lists.
 */
export const DO_DONT_TITLE_MAX_CHARS = 50;

/**
 * The most words on the bottom line, leaving the lists their height.
 */
const DO_DONT_FOOTNOTE_MAX_WORDS = 16;

/**
 * One side's examples; the schema rejects empty text and counts outside two to four.
 */
const Examples = Schema.Array(textField(DO_DONT_ITEM_MAX_CHARS, 'an example')).check(
  Schema.isMinLength(MIN_DO_DONT_ITEMS, {
    message: `Expected at least ${MIN_DO_DONT_ITEMS} examples`,
  }),
  Schema.isMaxLength(MAX_DO_DONT_ITEMS, {
    message: `Expected at most ${MAX_DO_DONT_ITEMS} examples`,
  }),
);

/**
 * The contract of do-dont: practical examples of behaviours to follow and avoid.
 */
export const doDontLayoutContract = defineLayoutContract({
  name: 'do-dont',
  description:
    'Two columns of practical examples: what to do and what to avoid, from `do:` and `dont:`. ' +
    'Each side lists two to four short items, with a tick or cross from the shared kit mark set and ' +
    'the positive or negative role. Headings and distinct marks keep the meaning clear without ' +
    'colour. Optional `labels.do` and `labels.dont` replace "Do" and "Don\'t"; `reveal: true` ' +
    "shows the Do column on the first step and the Don't column on the second. Use it to teach " +
    'working habits, safety guidance or a writing standard through concrete examples. Use ' +
    'comparison when options share measured rows, shift for one change from old to new, or ' +
    'columns when the groups have no positive or negative meaning.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    do: Examples,
    dont: Examples,
    labels: Schema.Struct({
      do: textField(DO_DONT_LABEL_MAX_CHARS, 'a Do heading').pipe(
        Schema.withDecodingDefaultKey(Effect.succeed('Do')),
      ),
      dont: textField(DO_DONT_LABEL_MAX_CHARS, "a Don't heading").pipe(
        Schema.withDecodingDefaultKey(Effect.succeed("Don't")),
      ),
    }).pipe(Schema.withDecodingDefaultKey(Effect.succeed({ do: 'Do', dont: "Don't" }))),
    reveal: RevealField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    do:
      `List ${MIN_DO_DONT_ITEMS} to ${MAX_DO_DONT_ITEMS} examples of what to do, each up to ` +
      `${DO_DONT_ITEM_MAX_CHARS} characters. Start with a concrete action. ` +
      'Rows line up across the two sides, so write the lists in matching order ' +
      'when the examples pair up.',
    dont:
      `List ${MIN_DO_DONT_ITEMS} to ${MAX_DO_DONT_ITEMS} examples of what to avoid, each up to ` +
      `${DO_DONT_ITEM_MAX_CHARS} characters. The two lists may have different lengths.`,
    labels:
      `Optional headings \`do\` and \`dont\`, each up to ${DO_DONT_LABEL_MAX_CHARS} characters; ` +
      'defaults to "Do" and "Don\'t".',
    reveal:
      "Write `reveal: true` to show the Do column on step 1 and the Don't column on step 2, " +
      'or leave it out to show both together.',
    chrome: CHROME_HINT,
  },
  title: { required: true, maxChars: DO_DONT_TITLE_MAX_CHARS },
  slots: {
    body: {
      description: 'One sentence under the title giving the situation these examples apply to.',
      accepts: ['text'],
    },
    footnote: {
      description: 'A source or caveat on the bottom line.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: CONTEXT_MAX_WORDS },
    footnote: { maxWords: DO_DONT_FOOTNOTE_MAX_WORDS },
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
      title: 'Water the roots, leave the trunk clear',
      do: ['Water slowly into the soil', 'Keep mulch away from the trunk'],
      dont: ['Spray the leaves at midday', 'Pile fresh mulch against the bark'],
    },
    body: [
      'For every newly planted street tree in its first two summers.',
      '',
      '<Footnote>Larkfield watering wardens guide, 2027.</Footnote>',
      '',
      '<Notes>',
      'Show the right habit first, then the mistake it prevents.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
