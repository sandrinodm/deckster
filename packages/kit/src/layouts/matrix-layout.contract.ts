import type { FieldProblem } from '@deckster/engine/layout';

import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import {
  CHROME_HINT,
  chromeField,
  EYEBROW_HINT,
  EyebrowField,
  RevealField,
  textField,
} from '#layouts/layout-fields.ts';

/**
 * The fewest items a matrix places: fewer is a sentence, not a map.
 */
export const MIN_MATRIX_ITEMS = 3;

/**
 * The most items a matrix places; more crowd the plot until their names cannot find room.
 */
export const MAX_MATRIX_ITEMS = 10;

/**
 * The longest item name, in characters: one or two short lines beside its dot.
 */
export const MATRIX_ITEM_MAX_CHARS = 18;

/**
 * The fewest items at which the plot is crowded and names are held shorter.
 */
export const MATRIX_CROWDED_ITEMS = 7;

/**
 * The longest item name on a crowded plot, in characters: one line beside its dot.
 */
export const MATRIX_ITEM_MAX_CHARS_CROWDED = 14;

/**
 * The longest label at either end of an axis, in characters: `Slow to plant`, `Costly to keep`.
 */
export const MATRIX_AXIS_MAX_CHARS = 16;

/**
 * The longest quadrant caption, in characters: two short lines in the corner of a quadrant.
 */
export const MATRIX_QUADRANT_MAX_CHARS = 24;

/**
 * The longest matrix title, in characters: two lines at the smallest fit step.
 */
export const MATRIX_TITLE_MAX_CHARS = 60;

/**
 * The most words of the note beside the plot: the "so what" in a few lines.
 */
export const MATRIX_NOTE_MAX_WORDS = 40;

/**
 * The most words of the source or caveat on the bottom line, such as who placed the items and how.
 */
const MATRIX_FOOTNOTE_MAX_WORDS = 24;

/**
 * The closest two items may stand, in axis units (the plot is 100 by 100): nearer than this their
 * dots touch and read as one.
 */
export const MATRIX_MIN_DISTANCE = 6;

/**
 * The position at the high end of an axis; positions run from 0 at the low end to this.
 */
const MAX_POSITION = 100;

/**
 * The position of the centre line of each axis, where a dot lies in no quadrant.
 */
const AXIS_CENTRE = MAX_POSITION / 2;

/**
 * The order `quadrants:` lists its captions in, as the plot is read: the top row from left to
 * right, then the bottom row.
 */
export const MATRIX_QUADRANTS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;

/**
 * One of {@link MATRIX_QUADRANTS}.
 */
export type MatrixQuadrant = (typeof MATRIX_QUADRANTS)[number];

/**
 * A position on one axis, from 0 (the low end) to 100 (the high end).
 */
const Position = Schema.Finite.check(
  Schema.isBetween(
    { minimum: 0, maximum: MAX_POSITION },
    {
      message: `Expected a position from 0 (the low end) to ${MAX_POSITION} (the high end)`,
    },
  ),
);

/**
 * The label at one end of an axis, decoded from a slide's frontmatter.
 */
const axisLabel = textField(MATRIX_AXIS_MAX_CHARS, 'an axis label');

/**
 * The labels at the two ends of one axis.
 */
const Axis = Schema.Struct({
  low: axisLabel,
  high: axisLabel,
});

/**
 * One item on the plot: its name, where the author judges it stands on each axis, and whether it is
 * the subject of the slide.
 */
const Item = Schema.Struct({
  name: textField(MATRIX_ITEM_MAX_CHARS, 'an item name'),
  x: Position,
  y: Position,
  us: Schema.optionalKey(Schema.Boolean),
});

/**
 * One item as a slide's frontmatter writes it, decoded.
 */
export type MatrixItemEntry = typeof Item.Type;

/**
 * The labels of one axis as a slide's frontmatter writes them, decoded.
 */
export type MatrixAxisEntry = typeof Axis.Type;

/**
 * The quadrant a position falls in, or `undefined` on a centre line, where it is in none.
 *
 * @param x - The position on the horizontal axis, 0 to 100.
 * @param y - The position on the vertical axis, 0 to 100.
 */
export function quadrantOf(x: number, y: number): MatrixQuadrant | undefined {
  if (x === AXIS_CENTRE || y === AXIS_CENTRE) {
    return undefined;
  }

  const row = y > AXIS_CENTRE ? 'top' : 'bottom';
  const column = x > AXIS_CENTRE ? 'right' : 'left';
  return `${row}-${column}`;
}

/**
 * The problems with a matrix's items: more than one marked `us`, or two standing so close that
 * their dots touch.
 *
 * @param items - The decoded items.
 * @returns One problem per extra subject and per pair too close, naming the items.
 */
export function matrixProblems(items: readonly MatrixItemEntry[]): FieldProblem[] {
  const problems: FieldProblem[] = [];
  const subjects = items.flatMap((item, index) => (item.us === true ? [index] : []));
  const subjectNames = subjects.map((at) => `"${items[at]?.name ?? ''}"`).join(', ');
  for (const index of subjects.slice(1)) {
    problems.push({
      path: `items[${index}].us`,
      message: `More than one item is marked \`us\`: ${subjectNames}.`,
      fix:
        'Mark only the item the slide is about with `us: true`; the others are the field ' +
        'around it.',
    });
  }

  items.forEach((item, index) => {
    const near = items.findIndex(
      (other, at) =>
        at < index && Math.hypot(other.x - item.x, other.y - item.y) < MATRIX_MIN_DISTANCE,
    );
    const other = items[near];
    if (other !== undefined) {
      problems.push({
        path: `items[${index}]`,
        message:
          `"${item.name}" (${item.x}, ${item.y}) stands on top of "${other.name}" ` +
          `(${other.x}, ${other.y}).`,
        fix:
          `Move one of them at least ${MATRIX_MIN_DISTANCE} apart on either axis, or merge them ` +
          'into one item when they stand for the same thing.',
      });
    }
  });
  return problems;
}

/**
 * The contract of the `matrix` layout: a two-by-two map with two labelled axes, four quadrants and
 * a few items placed by judgement.
 */
export const matrixLayoutContract = defineLayoutContract({
  name: 'matrix',
  description:
    'A two-by-two map: two axes that cross at the centre, a label at each end of each axis, an ' +
    'optional caption in each quadrant, and three to ten items placed by judgement on a square ' +
    'plot, from `x:`, `y:`, `quadrants:` and `items:` in the frontmatter. The plot takes the ' +
    'right five columns of the slide; the title, the note and the footnote stand in the ' +
    'column to its left. Positions run from 0 ' +
    '(the low end) to 100 (the high end) and show no values, because they are qualitative. Mark ' +
    'the item the slide is about with `us: true`: it is set in the accent with a ring and its ' +
    'quadrant is tinted, while the others stay muted; names find room beside their dots by ' +
    'themselves, so place items at least a few units apart and keep the corners free when the ' +
    'quadrants have captions. The body is the note under the title: what the map means. ' +
    '`reveal: true` shows the axes first, then the other items, then the marked ' +
    'one with the note. Use it for a positioning or competition slide, or any choice framed by ' +
    'two trade-offs; use a chart (`<Scatter>`) when the positions are measured, and comparison ' +
    'when options are scored on several rows.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    x: Axis,
    y: Axis,
    quadrants: Schema.optionalKey(
      Schema.Array(textField(MATRIX_QUADRANT_MAX_CHARS, 'a quadrant caption')).check(
        Schema.isBetweenLength(MATRIX_QUADRANTS.length, MATRIX_QUADRANTS.length, {
          message:
            `Expected ${MATRIX_QUADRANTS.length} quadrant captions, in the order ` +
            MATRIX_QUADRANTS.join(', '),
        }),
      ),
    ),
    items: Schema.Array(Item).check(
      Schema.isMinLength(MIN_MATRIX_ITEMS, {
        message: `Expected at least ${MIN_MATRIX_ITEMS} items`,
      }),
      Schema.isMaxLength(MAX_MATRIX_ITEMS, {
        message: `Expected at most ${MAX_MATRIX_ITEMS} items`,
      }),
    ),
    reveal: RevealField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    x:
      'Write the labels at the two ends of the horizontal axis, `x: { low: Slow to plant, high: ' +
      `Fast to plant }\`, each up to ${MATRIX_AXIS_MAX_CHARS} characters.`,
    y:
      'Write the labels at the two ends of the vertical axis, `y: { low: Trees die young, high: ' +
      `Trees survive }\`, each up to ${MATRIX_AXIS_MAX_CHARS} characters.`,
    quadrants:
      `List ${MATRIX_QUADRANTS.length} captions of up to ${MATRIX_QUADRANT_MAX_CHARS} characters ` +
      'in reading order: top left, top right, bottom left, bottom right; or leave it out.',
    items:
      `List ${MIN_MATRIX_ITEMS} to ${MAX_MATRIX_ITEMS} items, each with \`name\` (up to ` +
      `${MATRIX_ITEM_MAX_CHARS} characters, ${MATRIX_ITEM_MAX_CHARS_CROWDED} with ` +
      `${MATRIX_CROWDED_ITEMS} or more items), \`x\` and \`y\` (0 for the low end to 100 for the ` +
      `high end, at least ${MATRIX_MIN_DISTANCE} apart from every other item) and, on the one ` +
      'item the slide is about, `us: true`.',
    reveal:
      'Write `reveal: true` to show the axes first, then the other items, then the item marked ' +
      '`us` with the note, or leave it out to show the whole map at once.',
    chrome: CHROME_HINT,
  },
  checks: (frontmatter) => matrixProblems(frontmatter.items),
  title: { required: true, maxChars: MATRIX_TITLE_MAX_CHARS },
  slots: {
    body: {
      description:
        'The note under the title, beside the plot: what the map means for the audience, in a ' +
        'sentence or two. ' +
        'Put the items in `items:`, not here.',
      accepts: ['text'],
    },
    footnote: {
      description: 'A source or caveat on the bottom line, such as who placed the items and how.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: MATRIX_NOTE_MAX_WORDS },
    footnote: { maxWords: MATRIX_FOOTNOTE_MAX_WORDS },
  },
  variants: [
    {
      name: `${MATRIX_CROWDED_ITEMS} or more items`,
      when: { counts: { items: { min: MATRIX_CROWDED_ITEMS } } },
      budget: {},
      // Every name needs room beside its dot; on a crowded plot that room is one short line.
      fields: { 'items[].name': { maxChars: MATRIX_ITEM_MAX_CHARS_CROWDED } },
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
      title: 'Only Larkfield plants fast and keeps its trees alive',
      eyebrow: 'Peer cities',
      x: { low: 'Slow to plant', high: 'Fast to plant' },
      y: { low: 'Trees die young', high: 'Trees survive' },
      quadrants: ['Careful but slow', 'Where we want to be', 'Stalled', 'Planting to lose'],
      // Ten items, the most a plot holds, so the example shows a full map within its limits.
      items: [
        { name: 'Larkfield', x: 78, y: 82, us: true },
        { name: 'Harrowgate', x: 30, y: 70 },
        { name: 'Elmsford', x: 72, y: 28 },
        { name: 'Port Wenna', x: 20, y: 22 },
        { name: 'Castlebridge', x: 56, y: 62 },
        { name: 'Northmoor', x: 40, y: 40 },
        { name: 'Ashby Vale', x: 88, y: 52 },
        { name: 'Kettering', x: 14, y: 48 },
        { name: 'Marlow Cross', x: 60, y: 12 },
        { name: 'Upton Hythe', x: 36, y: 88 },
      ],
    },
    body: [
      'Watering wardens keep 96% of new trees alive while crews plant at full pace.',
      '',
      '<Footnote>Placed by the programme team from each city’s 2025 report.</Footnote>',
      '',
      '<Notes>',
      'Name the two axes first, then the corner we want. Then show where we are.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
