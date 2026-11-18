import { deckCommand } from '@deckster/engine/command';
import { defineLayoutContract } from '@deckster/engine/layout';
import { Effect, Schema } from 'effect';

import { CHROME_HINT, chromeField, EYEBROW_HINT, EyebrowField } from '#layouts/layout-fields.ts';

/**
 * The longest table title, in characters: two lines at the smallest fit step.
 */
export const TABLE_TITLE_MAX_CHARS = 90;

/**
 * The most words a table holds, header included: about eight rows of five cells, two of them
 * numbers. Past that a table is a reference, not a slide.
 */
export const TABLE_MAX_WORDS = 60;

/**
 * The most words a table beside the aside holds: about six rows.
 */
export const TABLE_MAX_WORDS_WITH_ASIDE = 48;

/**
 * Which rows or columns the point rests on: a row by its first cell's text or its 1-based number
 * among the body rows, and a column by its header's text or its 1-based number.
 */
const TableHighlight = Schema.Struct({
  row: Schema.optionalKey(Schema.Union([Schema.NonEmptyString, Schema.Int])),
  column: Schema.optionalKey(Schema.Union([Schema.NonEmptyString, Schema.Int])),
});

/**
 * The contract of the `table` layout: a takeaway title over one table of exact values.
 */
export const tableLayoutContract = defineLayoutContract({
  name: 'table',
  description:
    'A title that states the takeaway over one table of exact values, written as a Markdown ' +
    'table or the kit <Table> (`' +
    deckCommand() +
    ' charts --json` lists its props; both are set alike): ' +
    'a lookup, a schedule, a feature or price grid. Columns of numbers ' +
    "are aligned right with tabular figures, the header is set in the brand's label style, and " +
    '`highlight: { row: Eastgate }` (or a column) marks what the point rests on the way the ' +
    "brand's charts do. A wide or long table steps down in size, never below the smallest type " +
    'the brand allows; past that `deck lint` asks you to cut rows or columns. Fill <Aside> with ' +
    'the "so what" to set it beside the table. Use a chart for a pattern across many values and ' +
    'comparison for two or three options; ' +
    'use status for readiness, risks for a risk register, actions for commitments, or schedule for durations.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    highlight: Schema.optionalKey(TableHighlight),
    numbers: Schema.Literals(['right', 'left']).pipe(
      Schema.withDecodingDefaultKey(Effect.succeed<'right' | 'left'>('right')),
    ),
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    highlight:
      'Name the row the point rests on by its first cell, `highlight: { row: Eastgate }`, or by ' +
      'number, `{ row: 3 }`; a column by its header or number, `{ column: 2027 }`.',
    numbers:
      'Leave it out to align columns of numbers right, or write `numbers: left` to keep every ' +
      'column as the table writes it.',
    chrome: CHROME_HINT,
  },
  title: { required: true, maxChars: TABLE_TITLE_MAX_CHARS },
  slots: {
    body: {
      description:
        'One table: a Markdown table or a kit <Table>, and nothing else. Write the takeaway in ' +
        '`title:`, and keep to about eight rows and five columns.',
      required: true,
      accepts: ['table'],
    },
    aside: {
      description: 'The "so what" beside the table: a ### heading and a sentence or two.',
      accepts: ['text', 'number'],
    },
    footnote: {
      description: 'The source and any caveat, on the bottom line.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: TABLE_MAX_WORDS },
    aside: { maxWords: 36 },
    footnote: { maxWords: 30 },
  },
  variants: [
    {
      name: 'with aside',
      when: { filled: ['aside'] },
      budget: { body: { maxWords: TABLE_MAX_WORDS_WITH_ASIDE } },
    },
  ],
  pptx: {
    type: 'title-only',
    placeholders: [{ kind: 'title', from: { selector: '.kit-title' } }],
  },
  example: {
    frontmatter: {
      title: 'Eastgate needs the most trees and gets them first',
      eyebrow: 'Planting schedule',
      highlight: { row: 'Eastgate' },
    },
    body: [
      '| District | Canopy now | Target 2040 | Trees | First planting |',
      '| --- | --- | --- | --- | --- |',
      '| Eastgate | 9% | 25% | 2,900 | Spring 2027 |',
      '| Millbrook | 12% | 25% | 1,900 | Spring 2030 |',
      '| Northfield | 26% | 30% | 700 | Spring 2032 |',
      '| Riverside | 34% | 35% | 500 | Spring 2034 |',
      '',
      '<Footnote>Canopy from the 2026 aerial survey; tree counts are large-species stock.</Footnote>',
      '',
      '<Notes>',
      'Read the Eastgate row across: lowest canopy, most trees, first in the ground.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
