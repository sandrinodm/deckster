import { defineLayoutContract, type LayoutVariant } from '@deckster/engine/layout';
import { Schema } from 'effect';

import {
  CHROME_HINT,
  chromeField,
  CONTEXT_MAX_WORDS,
  currentProblems,
  EYEBROW_HINT,
  EyebrowField,
  REVEAL_HINT,
  RevealField,
  textField,
} from '#layout-fields.ts';

/**
 * The fewest steps a process shows.
 */
export const MIN_STEPS = 3;

/**
 * The most steps a process shows; a longer one is grouped into phases.
 */
export const MAX_STEPS = 5;

/**
 * The longest step title, in characters: two lines in a third of the row.
 */
export const STEP_TITLE_MAX_CHARS = 32;

/**
 * The longest step text, in characters: four lines in a third of the row.
 */
export const STEP_TEXT_MAX_CHARS = 72;

/**
 * The longest step title in a row of five, in characters: two lines in a fifth of the row.
 */
export const STEP_TITLE_MAX_CHARS_IN_FIVE = 20;

/**
 * The longest step text in a row of four, in characters.
 */
export const STEP_TEXT_MAX_CHARS_IN_FOUR = 56;

/**
 * The longest step text in a row of five, in characters: four lines in a fifth of the row.
 */
export const STEP_TEXT_MAX_CHARS_IN_FIVE = 44;

/**
 * The longest steps title, in characters: two lines at the smallest fit step.
 */
export const STEPS_TITLE_MAX_CHARS = 60;

/**
 * One step of the process: what happens, and a line on how.
 */
const ProcessStep = Schema.Struct({
  title: textField(STEP_TITLE_MAX_CHARS, 'a step title'),
  text: Schema.optionalKey(textField(STEP_TEXT_MAX_CHARS, 'a step text')),
});

/**
 * One step as a slide's frontmatter writes it, decoded.
 */
export type ProcessStepEntry = typeof ProcessStep.Type;

/**
 * The variants of a row of four and of five, whose steps hold less text.
 */
const VARIANTS: readonly LayoutVariant[] = [
  {
    name: 'four steps',
    when: { counts: { steps: 4 } },
    budget: {},
    // A quarter of the row leaves each step fewer characters a line.
    fields: { 'steps[].text': { maxChars: STEP_TEXT_MAX_CHARS_IN_FOUR } },
  },
  {
    name: 'five steps',
    when: { counts: { steps: MAX_STEPS } },
    budget: {},
    // A fifth of the row leaves each step two short lines of title and four of text.
    fields: {
      'steps[].title': { maxChars: STEP_TITLE_MAX_CHARS_IN_FIVE },
      'steps[].text': { maxChars: STEP_TEXT_MAX_CHARS_IN_FIVE },
    },
  },
];

/**
 * The contract of the `steps` layout: a process of three to five numbered steps in order.
 */
export const stepsLayoutContract = defineLayoutContract({
  name: 'steps',
  description:
    'A process in order: three to five numbered steps along a line, each with a short title and ' +
    'a line or two on how, from `steps:` in the frontmatter. `current:` marks the step the talk ' +
    'is on (the line fills up to it), and `reveal: true` adds one step per click. Use it for ' +
    'how something is done; use timeline when the steps have dates, agenda for the parts of the ' +
    'talk, and cards for ideas that are not in order; ' +
    'use actions for commitments with owners or exercise for a timed activity.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    steps: Schema.Array(ProcessStep).check(
      Schema.isMinLength(MIN_STEPS, { message: `Expected at least ${MIN_STEPS} steps` }),
      Schema.isMaxLength(MAX_STEPS, { message: `Expected at most ${MAX_STEPS} steps` }),
    ),
    current: Schema.optionalKey(
      Schema.Int.check(
        Schema.isBetween(
          { minimum: 1, maximum: MAX_STEPS },
          { message: `Expected the number of a step, from 1 to ${MAX_STEPS}` },
        ),
      ),
    ),
    reveal: RevealField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    steps:
      `List ${MIN_STEPS} to ${MAX_STEPS} steps in order, each with \`title\` (up to ` +
      `${STEP_TITLE_MAX_CHARS} characters, ${STEP_TITLE_MAX_CHARS_IN_FIVE} in a row of five) and ` +
      `optionally \`text\` (up to ${STEP_TEXT_MAX_CHARS}, ${STEP_TEXT_MAX_CHARS_IN_FOUR} in a ` +
      `row of four, ${STEP_TEXT_MAX_CHARS_IN_FIVE} in a row of five).`,
    current: 'Write the number of the step the talk is on, `current: 2`, or leave it out.',
    reveal: REVEAL_HINT,
    chrome: CHROME_HINT,
  },
  checks: (frontmatter) => currentProblems(frontmatter, frontmatter.steps, 'step'),
  title: { required: true, maxChars: STEPS_TITLE_MAX_CHARS },
  slots: {
    body: {
      description:
        'One sentence under the title on what the process achieves. Put the steps in `steps:`.',
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
  variants: VARIANTS,
  pptx: {
    type: 'title-only',
    placeholders: [
      { kind: 'title', from: { selector: '.kit-title' } },
      { kind: 'body', from: { slot: 'body' } },
    ],
  },
  example: {
    frontmatter: {
      title: 'Four steps put a tree in the ground for good',
      eyebrow: 'How we plant',
      steps: [
        { title: 'Survey the block', text: 'Surface temperature, pipes, cables and sight lines.' },
        { title: 'Build the pit', text: 'Connected soil cells, 12 m³ under the pavement.' },
        { title: 'Plant in autumn', text: 'Large-species stock, staked and mulched.' },
        { title: 'Water three summers', text: 'Weekly rounds until the roots reach the cells.' },
      ],
      current: 2,
    },
    body: [
      'Every tree in the plan goes through all four.',
      '',
      '<Notes>',
      'Walk the four steps, then stop on the second: the pit is where the money goes.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
