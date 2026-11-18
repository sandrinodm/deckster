import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { slideBudget } from '@deckster/engine/layout';
import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import {
  DEFAULT_EXAMPLE_LABEL,
  DEFINITION_EXAMPLE_LABEL_MAX_CHARS,
  DEFINITION_EXAMPLE_MAX_CHARS,
  DEFINITION_KIND_MAX_CHARS,
  DEFINITION_MAX_WORDS,
  DEFINITION_PRONUNCIATION_MAX_CHARS,
  DEFINITION_TERM_MAX_CHARS,
  definitionLayoutContract,
} from '#layouts/definition-layout.contract.ts';
import { LIMIT_CASES } from '#layouts/limit-cases.ts';

/**
 * Decodes the shared slide fields and the entry fields, refusing unknown keys as the build does.
 */
function decode(frontmatter: Record<string, unknown>): unknown {
  const schema = Schema.Struct({
    ...SlideFrontmatter.fields,
    ...definitionLayoutContract.schema.fields,
  });
  return Schema.decodeUnknownSync(schema)(
    { layout: 'definition', ...frontmatter },
    { onExcessProperty: 'error' },
  );
}

describe('the definition layout contract', () => {
  it('requires one term and keeps metadata and the example optional', () => {
    expect(decode({ term: 'Canopy' })).toMatchObject({
      term: 'Canopy',
      chrome: true,
      labels: { example: DEFAULT_EXAMPLE_LABEL },
    });
    expect(decode({ term: 'Canopy' })).not.toHaveProperty('example');
    expect(decode({ term: 'Canopy', labels: {} })).toMatchObject({
      labels: { example: DEFAULT_EXAMPLE_LABEL },
    });
    expect(decode({ term: 'Canopy', labels: { example: 'Usage' } })).toMatchObject({
      labels: { example: 'Usage' },
    });
    expect(() =>
      decode({
        term: 'Canopy',
        labels: { example: 'W'.repeat(DEFINITION_EXAMPLE_LABEL_MAX_CHARS + 1) },
      }),
    ).toThrow('at most 16 characters');
    expect(() =>
      decode({
        term: 'Canopy',
        labels: { example: 'W'.repeat(DEFINITION_EXAMPLE_LABEL_MAX_CHARS) },
      }),
    ).not.toThrow();
    expect(() => decode({ term: 'Canopy', labels: { example: '' } })).toThrow('example');
    expect(() => decode({ term: 'Canopy', exampleLabel: 'Old' })).toThrow('excess');
    expect(() => decode({})).toThrow(/term/u);
    expect(() => decode({ term: '' })).toThrow(/Expected/u);
    expect(() => decode({ term: 'Canopy', colour: 'red' })).toThrow('Expected no excess property');
  });

  it('accepts every entry field exactly at its limit and rejects one character more', () => {
    const fields = {
      term: DEFINITION_TERM_MAX_CHARS,
      pronunciation: DEFINITION_PRONUNCIATION_MAX_CHARS,
      kind: DEFINITION_KIND_MAX_CHARS,
      example: DEFINITION_EXAMPLE_MAX_CHARS,
    };
    for (const [field, maxChars] of Object.entries(fields)) {
      expect(() => decode({ term: 'Canopy', [field]: 'W'.repeat(maxChars) })).not.toThrow();
      expect(() => decode({ term: 'Canopy', [field]: 'W'.repeat(maxChars + 1) })).toThrow(
        `at most ${maxChars} characters`,
      );
      expect(() => decode({ term: 'Canopy', [field]: '' })).toThrow(/Expected/u);
    }
  });

  it('budgets the meaning as prose and puts the source on the bottom line', () => {
    expect(definitionLayoutContract.slots.body).toMatchObject({
      required: true,
      accepts: ['text'],
    });
    expect(slideBudget(definitionLayoutContract, 'body', { frontmatter: {}, filled: [] })).toEqual({
      maxWords: DEFINITION_MAX_WORDS,
    });
    expect(definitionLayoutContract.slots).toHaveProperty('footnote');
    expect(definitionLayoutContract.title).toMatchObject({ required: true });
  });

  it('maps native title and body export placeholders', () => {
    expect(definitionLayoutContract.pptx).toMatchObject({
      type: 'content',
      placeholders: [{ kind: 'title' }, { kind: 'body' }],
    });
  });

  it('decodes every stress case with a title', () => {
    for (const limitCase of LIMIT_CASES['definition'] ?? []) {
      expect(() => decode({ title: 'A shared meaning', ...limitCase.frontmatter })).not.toThrow();
    }
  });

  it('fills every optional entry field to its maximum in the full stress case', () => {
    const full = LIMIT_CASES['definition']?.find((limitCase) => limitCase.name === 'full');
    const fields = {
      pronunciation: DEFINITION_PRONUNCIATION_MAX_CHARS,
      kind: DEFINITION_KIND_MAX_CHARS,
      example: DEFINITION_EXAMPLE_MAX_CHARS,
    };
    expect(full?.frontmatter.labels).toEqual({ example: expect.any(String) });
    expect((full?.frontmatter.labels as { example: string } | undefined)?.example).toHaveLength(
      DEFINITION_EXAMPLE_LABEL_MAX_CHARS,
    );
    for (const [field, maxChars] of Object.entries(fields)) {
      expect(full?.frontmatter[field]).toHaveLength(maxChars);
    }
  });

  it('allows the author to hide chrome', () => {
    expect(decode({ term: 'Canopy', chrome: false })).toMatchObject({ chrome: false });
  });
});
