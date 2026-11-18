import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import {
  CHROME_HINT,
  chromeField,
  CONTEXT_MAX_WORDS,
  EYEBROW_HINT,
  EyebrowField,
  REVEAL_HINT,
  RevealField,
  textField,
} from '#layouts/layout-fields.ts';

/**
 * The fewest question-and-answer pairs on a FAQ slide.
 */
export const MIN_FAQ_QUESTIONS = 2;

/**
 * The most pairs; longer FAQs belong on several slides or in a document.
 */
export const MAX_FAQ_QUESTIONS = 4;

/**
 * The longest question, in characters, including its question mark.
 */
export const FAQ_QUESTION_MAX_CHARS = 52;

/**
 * The longest answer, in characters: one or two short sentences.
 */
export const FAQ_ANSWER_MAX_CHARS = 140;

/**
 * The longest question in a grid of three or four pairs, in characters.
 */
export const FAQ_QUESTION_MAX_CHARS_DENSE = 44;

/**
 * The longest answer in a grid of three or four pairs, in characters.
 */
export const FAQ_ANSWER_MAX_CHARS_DENSE = 104;

/**
 * The longest FAQ title, in characters, kept to one line.
 */
export const FAQ_TITLE_MAX_CHARS = 50;

/**
 * One required question and its required answer, kept together during reveals.
 */
const FaqQuestion = Schema.Struct({
  q: textField(FAQ_QUESTION_MAX_CHARS, 'a question'),
  a: textField(FAQ_ANSWER_MAX_CHARS, 'an answer'),
});

/**
 * One decoded question-and-answer pair.
 */
export type FaqQuestionEntry = typeof FaqQuestion.Type;

/**
 * The contract of `faq`: short answers to the audience's likely questions.
 */
export const faqLayoutContract = defineLayoutContract({
  name: 'faq',
  description:
    'Two to four question-and-answer pairs from `questions:`, under a title that states the ' +
    'point. Each `q` is the heading of its block, followed by its short `a`: one or two ' +
    'sentences. Two pairs sit side by side with title-sized questions and lead answers; three ' +
    'or four form a two-column grid ' +
    'in reading order, with the last cell empty for three. Use it to answer practical objections ' +
    'or recurring questions before a decision. Use cards for parallel claims that are not ' +
    'questions, comparison for alternatives measured on shared criteria, and content for one ' +
    'long explanation. `reveal: true` reveals one complete pair per step, question and answer ' +
    'together; static views and exports show every pair.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    questions: Schema.Array(FaqQuestion).check(
      Schema.isMinLength(MIN_FAQ_QUESTIONS, {
        message: `Expected at least ${MIN_FAQ_QUESTIONS} questions`,
      }),
      Schema.isMaxLength(MAX_FAQ_QUESTIONS, {
        message: `Expected at most ${MAX_FAQ_QUESTIONS} questions`,
      }),
    ),
    reveal: RevealField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    questions:
      `List ${MIN_FAQ_QUESTIONS} to ${MAX_FAQ_QUESTIONS} pairs, each with \`q\` (a question ` +
      `of up to ${FAQ_QUESTION_MAX_CHARS} characters, ${FAQ_QUESTION_MAX_CHARS_DENSE} with ` +
      `3 or 4 pairs) and \`a\` (one or two sentences of up to ${FAQ_ANSWER_MAX_CHARS} ` +
      `characters, ${FAQ_ANSWER_MAX_CHARS_DENSE} with 3 or 4 pairs). Put them in reading ` +
      'order, left to right then down.',
    reveal: REVEAL_HINT + ' Each step shows a complete question and its answer together.',
    chrome: CHROME_HINT,
  },
  title: { required: true, maxChars: FAQ_TITLE_MAX_CHARS },
  slots: {
    body: {
      description:
        'One sentence introducing the questions. Put the pairs in `questions:`, not here.',
      accepts: ['text'],
    },
    footnote: {
      description: 'A source, qualification or date on the bottom line.',
      accepts: ['text'],
    },
  },
  budget: { body: { maxWords: CONTEXT_MAX_WORDS }, footnote: { maxWords: 16 } },
  variants: [
    {
      name: 'three or four questions',
      when: { counts: { questions: { min: 3, max: MAX_FAQ_QUESTIONS } } },
      budget: {},
      fields: {
        'questions[].q': { maxChars: FAQ_QUESTION_MAX_CHARS_DENSE },
        'questions[].a': { maxChars: FAQ_ANSWER_MAX_CHARS_DENSE },
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
      title: 'Every tree gets three summers of care',
      eyebrow: 'Before we plant',
      questions: [
        { q: 'Who waters the trees?', a: 'Our crews water each tree for its first three summers.' },
        {
          q: 'What if a tree dies?',
          a: 'We replace it in the next planting season and restart its care.',
        },
      ],
    },
    body: '<Notes>Answer the two questions residents ask most often.</Notes>\n',
  },
});
