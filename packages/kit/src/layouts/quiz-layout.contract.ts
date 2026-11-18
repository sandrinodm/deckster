import { defineLayoutContract, type FieldProblem } from '@deckster/engine/layout';
import { Effect, Schema } from 'effect';

import {
  CHROME_HINT,
  chromeField,
  CONTEXT_MAX_WORDS,
  EYEBROW_HINT,
  EyebrowField,
  textField,
} from '#layouts/layout-fields.ts';
import { QUIZ_LETTERS, QUIZ_TILE_MAX_CHARS } from '#layouts/quiz-values.ts';

export { QUIZ_LETTERS, QUIZ_TILE_MAX_CHARS } from '#layouts/quiz-values.ts';

/**
 * The fewest choices in a question to the room.
 */
export const MIN_QUIZ_OPTIONS = 2;

/**
 * The most choices, lettered A to D, that the room can weigh at once.
 */
export const MAX_QUIZ_OPTIONS = 4;

/**
 * The longest choice, in characters, across the row beside its letter and answer mark.
 */
export const QUIZ_OPTION_MAX_CHARS = 72;

/**
 * The longest explanation, in characters: a short reason under the choices.
 */
export const QUIZ_EXPLANATION_MAX_CHARS = 100;

/**
 * The longest question, in characters; the header keeps it on one line by stepping down.
 */
export const QUIZ_TITLE_MAX_CHARS = 50;

/**
 * A letter identifying a quiz choice.
 */
export type QuizAnswer = (typeof QUIZ_LETTERS)[number];

/**
 * Refuses an answer letter that has no choice on this slide.
 *
 * @param options - The choices in letter order.
 * @param answer - The letter of the right choice.
 * @returns A field problem when the letter points past the choices, otherwise none.
 */
export function quizProblems(options: readonly string[], answer: QuizAnswer): FieldProblem[] {
  if (QUIZ_LETTERS.indexOf(answer) < options.length) {
    return [];
  }

  return [
    {
      path: 'answer',
      message: `Answer ${answer} has no option; this quiz has ${options.length} options.`,
      fix: `Set \`answer\` to one of ${QUIZ_LETTERS.slice(0, options.length).join(', ')}.`,
    },
  ];
}

/**
 * A question to the room with lettered choices and a single answer reveal.
 */
export const quizLayoutContract = defineLayoutContract({
  name: 'quiz',
  description:
    'A question to the room: the title poses one specific question and `options:` gives two to ' +
    'four short choices, lettered A to D in order. `answer:` names the right letter. All choices ' +
    'show first; the next step marks the answer with an accent panel and a tick, quiets the ' +
    'other choices and shows the optional `explanation:` underneath. The space is reserved so ' +
    'nothing moves when the answer arrives. `reveal` defaults to true; set it to false for an ' +
    'answered recap. Short options use tiles; longer options use full-width rows. ' +
    'A plain export shows the answer; a per-step export (`--steps`) shows the question, then ' +
    'the answer. Use it to test an ' +
    'assumption or invite a quick knowledge check before giving the reason. Use cards for ' +
    'parallel ideas with no right answer, comparison for alternatives measured on shared rows, ' +
    'and content for an open question without fixed choices.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    options: Schema.Array(textField(QUIZ_OPTION_MAX_CHARS, 'an option')).check(
      Schema.isMinLength(MIN_QUIZ_OPTIONS, {
        message: `Expected at least ${MIN_QUIZ_OPTIONS} options`,
      }),
      Schema.isMaxLength(MAX_QUIZ_OPTIONS, {
        message: `Expected at most ${MAX_QUIZ_OPTIONS} options`,
      }),
    ),
    answer: Schema.Literals(QUIZ_LETTERS),
    explanation: Schema.optionalKey(textField(QUIZ_EXPLANATION_MAX_CHARS, 'an explanation')),
    reveal: Schema.Boolean.pipe(Schema.withDecodingDefaultKey(Effect.succeed(true))),
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    options:
      `List ${MIN_QUIZ_OPTIONS} to ${MAX_QUIZ_OPTIONS} choices, each a string of up to ` +
      `${QUIZ_OPTION_MAX_CHARS} characters. Letters A to D are added in order. ` +
      `Options all at most ${QUIZ_TILE_MAX_CHARS} characters use tiles; ` +
      'longer choices use rows.',
    answer: 'Name the right choice by its uppercase letter: `answer: B`. The letter must exist.',
    explanation:
      `Give the reason in up to ${QUIZ_EXPLANATION_MAX_CHARS} characters; ` +
      'it appears with the answer.',
    reveal:
      'Defaults to true: show all choices first, then the answer on step 1. Set `reveal: false` ' +
      'to show the answered recap immediately.',
    chrome: CHROME_HINT,
  },
  checks: (frontmatter) => quizProblems(frontmatter.options, frontmatter.answer),
  title: { required: true, maxChars: QUIZ_TITLE_MAX_CHARS },
  slots: {
    body: {
      description: 'One line of context for the question; the choices belong in `options:`.',
      accepts: ['text'],
    },
    footnote: {
      description: 'A source or caveat on the bottom line, visible before the answer.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: CONTEXT_MAX_WORDS },
    footnote: { maxWords: 16 },
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
      title: 'What keeps a young street tree alive?',
      eyebrow: 'A question for the room',
      options: ['A taller stake', 'Three summers of watering', 'A bigger planting day'],
      answer: 'B',
      explanation:
        'Planting starts the work; water and regular checks carry it through ' +
        'the first three summers.',
      reveal: true,
    },
    body: '<Notes>Ask for a show of hands, then reveal B and explain the care commitment.</Notes>\n',
  },
});
