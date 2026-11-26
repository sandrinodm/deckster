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
} from '#layout-fields.ts';

/**
 * The longest state label, in characters: `Today`, `With the plan`, `2025`.
 */
export const SHIFT_LABEL_MAX_CHARS = 24;

/**
 * The longest state figure, in characters: `$8.50`, `11 days`, `1 in 4`.
 */
export const SHIFT_VALUE_MAX_CHARS = 8;

/**
 * The longest state heading, in characters: two lines of headline type in the six columns of the
 * new state.
 */
export const SHIFT_HEADING_MAX_CHARS = 36;

/**
 * The longest state text, in characters: three lines in the five columns of the old state.
 */
export const SHIFT_TEXT_MAX_CHARS = 80;

/**
 * The longest shift title, in characters: two lines across the slide at the smallest fit step.
 */
export const SHIFT_TITLE_MAX_CHARS = 60;

/**
 * The most words of the source or caveat on the bottom line, under the old state.
 */
const SHIFT_FOOTNOTE_MAX_WORDS = 16;

/**
 * One state of the shift: what it is called, an optional figure, a heading and a line on it.
 */
const ShiftState = Schema.Struct({
  label: Schema.optionalKey(textField(SHIFT_LABEL_MAX_CHARS, 'a label')),
  value: Schema.optionalKey(
    Schema.Union([Schema.Finite, textField(SHIFT_VALUE_MAX_CHARS, 'a figure')]),
  ),
  title: textField(SHIFT_HEADING_MAX_CHARS, 'a heading'),
  text: Schema.optionalKey(textField(SHIFT_TEXT_MAX_CHARS, 'a text')),
});

/**
 * One state as a slide's frontmatter writes it, decoded.
 */
export type ShiftStateEntry = typeof ShiftState.Type;

/**
 * The fix shown when a state is invalid.
 *
 * @param which - `from` or `to`.
 */
function stateHint(which: 'from' | 'to'): string {
  const example = which === 'from' ? 'Today' : 'With the plan';
  return (
    `Write \`${which}:\` with \`title\` (up to ${SHIFT_HEADING_MAX_CHARS} characters) and ` +
    `optionally \`label\` (up to ${SHIFT_LABEL_MAX_CHARS}, such as "${example}"), \`value\` ` +
    `(a figure as shown, up to ${SHIFT_VALUE_MAX_CHARS} characters) and \`text\` (up to ` +
    `${SHIFT_TEXT_MAX_CHARS}).`
  );
}

/**
 * The contract of the `shift` layout: one change from an old state to a new one, the new one on the
 * accent surface.
 */
export const shiftLayoutContract = defineLayoutContract({
  name: 'shift',
  description:
    'One change, from the way things are to the way they will be: under the title, the old state ' +
    '(`from:`) on the left and the new state (`to:`) on an accent panel that runs to the right ' +
    'and bottom edges of the slide, with an arrow on the seam between them. Each state has a ' +
    'heading, and optionally a label (Today, With the plan), a figure and a line of text; their ' +
    'rows line up across the seam so the eye compares like with like, and `reveal: true` brings ' +
    'in the new state on a click. Use it for the turn a talk argues for (a new process, a new ' +
    'cost, a new owner); use comparison when two or three options are measured on several rows, ' +
    'and the <Comparison> chart when the change is one number.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    from: ShiftState,
    to: ShiftState,
    reveal: RevealField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    from: stateHint('from'),
    to: stateHint('to'),
    reveal:
      'Write `reveal: true` to show the old state first and the new one on the next step, or ' +
      'leave it out to show both at once.',
    chrome: CHROME_HINT,
  },
  title: { required: true, maxChars: SHIFT_TITLE_MAX_CHARS },
  slots: {
    body: {
      description:
        'One sentence under the title on why the change matters. Put the two states in ' +
        '`from:` and `to:`, not here.',
      accepts: ['text'],
    },
    footnote: {
      description: 'A source or caveat on the bottom line, under the old state.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: CONTEXT_MAX_WORDS },
    footnote: { maxWords: SHIFT_FOOTNOTE_MAX_WORDS },
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
      title: 'Residents ask, and the city plants',
      eyebrow: 'The request process',
      from: {
        label: 'Until 2026',
        value: '14 mo',
        title: 'A tree when a block is redone',
        text: 'Streets got trees only when the road was rebuilt, on the roads plan.',
      },
      to: {
        label: 'From spring 2027',
        value: '10 wk',
        title: 'A tree when a resident asks',
        text: 'Any resident can request a street tree; crews plant the next season.',
      },
    },
    body: [
      'Demand outran the roads plan in the first summer.',
      '',
      '<Footnote>Median wait from first request to planting, 2024 to 2026.</Footnote>',
      '',
      '<Notes>',
      'Read the old way first, then click to the panel: the city plants when someone asks.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
