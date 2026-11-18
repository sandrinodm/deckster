import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { fieldLimitBreaches, slideFieldLimits } from '@deckster/engine/layout';
import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import {
  FAQ_ANSWER_MAX_CHARS,
  FAQ_ANSWER_MAX_CHARS_DENSE,
  FAQ_QUESTION_MAX_CHARS,
  FAQ_QUESTION_MAX_CHARS_DENSE,
  faqLayoutContract,
} from '#layouts/faq-layout.contract.ts';

/**
 * A complete pair for the frontmatter boundary tests.
 */
const PAIR = { q: 'Who waters the trees?', a: 'Our crews water them for three summers.' };

/**
 * Decodes the shared and FAQ fields as the build does, refusing excess fields.
 *
 * @param frontmatter - Fields without the layout name.
 */
function decode(frontmatter: Record<string, unknown>): unknown {
  const schema = Schema.Struct({ ...SlideFrontmatter.fields, ...faqLayoutContract.schema.fields });
  return Schema.decodeUnknownSync(schema)(
    { layout: 'faq', ...frontmatter },
    { onExcessProperty: 'error' },
  );
}

describe('the faq layout contract', () => {
  it('takes two to four complete pairs', () => {
    for (const count of [2, 3, 4]) {
      expect(() => decode({ questions: Array(count).fill(PAIR) })).not.toThrow();
    }

    expect(() => decode({ questions: [PAIR] })).toThrow('at least 2 questions');
    expect(() => decode({ questions: Array(5).fill(PAIR) })).toThrow('at most 4 questions');
    expect(() => decode({ questions: [{ q: 'Why?' }, PAIR] })).toThrow('Missing key');
    expect(() => decode({ questions: [{ ...PAIR, a: '' }, PAIR] })).toThrow(/length/u);
  });

  it('bounds questions and answers independently', () => {
    for (const [field, max] of [
      ['q', FAQ_QUESTION_MAX_CHARS],
      ['a', FAQ_ANSWER_MAX_CHARS],
    ] as const) {
      expect(() =>
        decode({ questions: [{ ...PAIR, [field]: 'x'.repeat(max) }, PAIR] }),
      ).not.toThrow();
      expect(() =>
        decode({ questions: [{ ...PAIR, [field]: 'x'.repeat(max + 1) }, PAIR] }),
      ).toThrow(`at most ${max} characters`);
    }
  });

  it('shows all pairs and the chrome by default, with an optional reveal', () => {
    expect(decode({ questions: [PAIR, PAIR] })).toMatchObject({ reveal: false, chrome: true });
    expect(decode({ questions: [PAIR, PAIR], reveal: true, chrome: false })).toMatchObject({
      reveal: true,
      chrome: false,
    });
    expect(() => decode({ questions: [{ ...PAIR, extra: true }, PAIR] })).toThrow(
      'Expected no excess property',
    );
  });

  it('tightens questions and answers at both grid counts in a single variant', () => {
    for (const count of [2, 3, 4]) {
      for (const [field, max] of [
        ['q', FAQ_QUESTION_MAX_CHARS_DENSE],
        ['a', FAQ_ANSWER_MAX_CHARS_DENSE],
      ] as const) {
        const questions = Array(count).fill({ ...PAIR, [field]: 'x'.repeat(max + 1) });
        const limits = slideFieldLimits(faqLayoutContract, {
          frontmatter: { questions },
          filled: [],
        });
        expect(fieldLimitBreaches({ questions }, limits)).toHaveLength(count === 2 ? 0 : count);
      }
    }
  });

  it('exports the title and context through PowerPoint placeholders', () => {
    expect(faqLayoutContract.pptx).toMatchObject({
      type: 'title-only',
      placeholders: [{ kind: 'title' }, { kind: 'body' }],
    });
  });
});
