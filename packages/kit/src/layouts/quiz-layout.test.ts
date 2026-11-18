import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import {
  QUIZ_EXPLANATION_MAX_CHARS,
  QUIZ_OPTION_MAX_CHARS,
  quizLayoutContract,
  quizProblems,
} from '#layouts/quiz-layout.contract.ts';

/**
 * Decodes the quiz with the shared slide fields, refusing misspelled fields as the build does.
 *
 * @param fields - The quiz frontmatter without its layout name.
 */
function decode(fields: Record<string, unknown>): unknown {
  const schema = Schema.Struct({ ...SlideFrontmatter.fields, ...quizLayoutContract.schema.fields });
  return Schema.decodeUnknownSync(schema)(
    { layout: 'quiz', ...fields },
    { onExcessProperty: 'error' },
  );
}

describe('the quiz layout contract', () => {
  it('requires two to four nonempty options and an uppercase answer letter', () => {
    expect(() => decode({ options: ['Yes', 'No'], answer: 'A' })).not.toThrow();
    expect(() => decode({ options: ['One', 'Two', 'Three', 'Four'], answer: 'D' })).not.toThrow();
    expect(() => decode({ options: ['Yes'], answer: 'A' })).toThrow('at least 2 options');
    expect(() => decode({ options: Array(5).fill('Yes'), answer: 'A' })).toThrow(
      'at most 4 options',
    );
    expect(() => decode({ options: ['', 'No'], answer: 'A' })).toThrow(/options/u);
    expect(() => decode({ options: ['Yes', 'No'], answer: 'a' })).toThrow(/answer/u);
    expect(() => decode({ options: ['Yes', 'No'], answer: 1 })).toThrow(/answer/u);
    expect(() => decode({ options: ['Yes', 'No'] })).toThrow(/answer/u);
  });

  it('refuses an answer beyond the choices and accepts every letter that exists', () => {
    const decoded = Schema.decodeUnknownSync(quizLayoutContract.schema)({
      options: ['Yes', 'No'],
      answer: 'C',
    });
    expect(quizLayoutContract.checks?.(decoded)).toHaveLength(1);
    expect(quizProblems(['Yes', 'No'], 'B')).toEqual([]);
    expect(quizProblems(['Yes', 'No'], 'C')).toEqual([
      expect.objectContaining({ path: 'answer', fix: expect.stringContaining('A, B') }),
    ]);
    expect(quizProblems(['One', 'Two', 'Three'], 'C')).toEqual([]);
    expect(quizProblems(['One', 'Two', 'Three'], 'D')).toHaveLength(1);
    expect(quizProblems(['One', 'Two', 'Three', 'Four'], 'D')).toEqual([]);
  });

  it('holds choices and the optional reason to their published character limits', () => {
    const fields = {
      options: ['x'.repeat(QUIZ_OPTION_MAX_CHARS), 'No'],
      answer: 'A',
      explanation: 'x'.repeat(QUIZ_EXPLANATION_MAX_CHARS),
    };
    expect(() => decode(fields)).not.toThrow();
    expect(() => decode({ ...fields, options: [fields.options[0] + 'x', 'No'] })).toThrow(
      `at most ${QUIZ_OPTION_MAX_CHARS} characters`,
    );
    expect(() => decode({ ...fields, explanation: fields.explanation + 'x' })).toThrow(
      `at most ${QUIZ_EXPLANATION_MAX_CHARS} characters`,
    );
  });

  it('reveals the answer on the next step by default and supports an immediate recap', () => {
    const fields = { options: ['Yes', 'No'], answer: 'A' };
    expect(decode(fields)).toMatchObject({ reveal: true, chrome: true });
    expect(decode({ ...fields, reveal: false, chrome: false })).toMatchObject({
      reveal: false,
      chrome: false,
    });
    expect(() => decode({ ...fields, colour: 'red' })).toThrow('Expected no excess property');
  });

  it('maps the question and context to native PowerPoint placeholders', () => {
    expect(quizLayoutContract.pptx).toMatchObject({
      type: 'title-only',
      placeholders: [{ kind: 'title' }, { kind: 'body' }],
    });
  });
});
