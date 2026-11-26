import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import {
  CHROME_HINT,
  chromeField,
  CONTEXT_MAX_WORDS,
  EYEBROW_HINT,
  EyebrowField,
  textField,
} from '#layout-fields.ts';

/**
 * The timebox heading; its casing follows the brand's label style.
 */
export const EXERCISE_TIME_LABEL = 'Timebox';

/**
 * The deliverable heading; its casing follows the brand's label style.
 */
export const EXERCISE_OUTPUT_LABEL = 'Output';

/**
 * The grouping heading; its casing follows the brand's label style.
 */
export const EXERCISE_GROUPS_LABEL = 'Groups';

/**
 * The fewest instructions in an audience exercise.
 */
export const MIN_EXERCISE_INSTRUCTIONS = 2;

/**
 * The most instructions; a longer task belongs on a handout.
 */
export const MAX_EXERCISE_INSTRUCTIONS = 5;

/**
 * The instruction count at which shorter lines keep the task readable.
 */
export const EXERCISE_DENSE_FROM = 4;

/**
 * The longest instruction, in characters, for two or three steps.
 */
export const EXERCISE_INSTRUCTION_MAX_CHARS = 80;

/**
 * The longest instruction, in characters, for four or five steps.
 */
export const EXERCISE_INSTRUCTION_MAX_CHARS_DENSE = 64;

/**
 * The longest duration figure, in characters, including its unit.
 */
export const EXERCISE_DURATION_MAX_CHARS = 8;

/**
 * The longest grouping line, in characters: a short direction such as "In pairs".
 */
export const EXERCISE_GROUPS_MAX_CHARS = 24;

/**
 * The longest deliverable, in characters: one short line naming what to produce.
 */
export const EXERCISE_OUTPUT_MAX_CHARS = 60;

/**
 * The longest title, in characters, held to one line above the task.
 */
export const EXERCISE_TITLE_MAX_CHARS = 50;

/**
 * The contract of an audience task: a timebox, numbered instructions and a deliverable.
 */
export const exerciseLayoutContract = defineLayoutContract({
  name: 'exercise',
  description:
    'A task for the audience, with a title naming what to do, a duration set as a hero figure, ' +
    'two to five numbered instructions and a one-line output naming what to produce. An ' +
    'optional groups line says who works together. Use it for a workshop activity, a short ' +
    'practice task or a discussion that must end with a concrete deliverable. Keep the whole ' +
    'brief visible while people work. Use steps instead when explaining a process rather ' +
    'than asking the audience to do it, and agenda for the parts of the session.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    duration: textField(EXERCISE_DURATION_MAX_CHARS, 'a duration'),
    instructions: Schema.Array(textField(EXERCISE_INSTRUCTION_MAX_CHARS, 'an instruction')).check(
      Schema.isMinLength(MIN_EXERCISE_INSTRUCTIONS, {
        message: `Expected at least ${MIN_EXERCISE_INSTRUCTIONS} instructions`,
      }),
      Schema.isMaxLength(MAX_EXERCISE_INSTRUCTIONS, {
        message: `Expected at most ${MAX_EXERCISE_INSTRUCTIONS} instructions`,
      }),
    ),
    output: textField(EXERCISE_OUTPUT_MAX_CHARS, 'an output'),
    groups: Schema.optionalKey(textField(EXERCISE_GROUPS_MAX_CHARS, 'a grouping line')),
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    duration:
      `Write the timebox with its unit, up to ${EXERCISE_DURATION_MAX_CHARS} characters, ` +
      'such as `duration: 10 min`.',
    instructions:
      `List ${MIN_EXERCISE_INSTRUCTIONS} to ${MAX_EXERCISE_INSTRUCTIONS} instructions in order, ` +
      `each up to ${EXERCISE_INSTRUCTION_MAX_CHARS} characters; with ${EXERCISE_DENSE_FROM} ` +
      `or ${MAX_EXERCISE_INSTRUCTIONS} instructions, each is limited to ` +
      `${EXERCISE_INSTRUCTION_MAX_CHARS_DENSE} characters. Start each with a verb.`,
    output:
      `Name what people should produce, up to ${EXERCISE_OUTPUT_MAX_CHARS} characters, ` +
      'such as `output: One annotated route map`.',
    groups:
      `Say who works together, up to ${EXERCISE_GROUPS_MAX_CHARS} characters, ` +
      'such as `groups: In pairs`, or leave it out.',
    chrome: CHROME_HINT,
  },
  title: { required: true, maxChars: EXERCISE_TITLE_MAX_CHARS },
  slots: {
    body: {
      description: 'One sentence of context under the title. Put the task in `instructions:`.',
      accepts: ['text'],
    },
    footnote: {
      description: 'A source or facilitation reminder on the bottom line.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: CONTEXT_MAX_WORDS },
    footnote: { maxWords: 16 },
  },
  variants: [
    {
      name: 'four or five instructions',
      when: { counts: { instructions: { min: EXERCISE_DENSE_FROM } } },
      budget: {},
      fields: { 'instructions[]': { maxChars: EXERCISE_INSTRUCTION_MAX_CHARS_DENSE } },
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
      title: 'Choose the next block to plant',
      duration: '10 min',
      groups: 'In pairs',
      instructions: [
        'Compare the heat maps for Eastgate and Holloway.',
        'Choose one block and mark the space for a large tree.',
        'Explain how you will water it through three summers.',
      ],
      output: 'One marked map and a reason for your choice',
    },
    body: [
      'Start with the hottest streets, then check what fits below the pavement.',
      '',
      '<Notes>',
      'Keep the task visible while pairs work. Invite two pairs to share their maps.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
