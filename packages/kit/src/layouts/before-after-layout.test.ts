import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import {
  BEFORE_AFTER_ALT_MAX_CHARS,
  BEFORE_AFTER_CAPTION_MAX_CHARS,
  BEFORE_AFTER_LABEL_MAX_CHARS,
  beforeAfterLayoutContract,
} from '#layouts/before-after-layout.contract.ts';
import { LIMIT_CASES } from '#layouts/limit-cases.ts';

/**
 * A picture with the two required fields.
 */
const PICTURE = { src: 'assets/street.jpg', alt: 'The same street in summer' };

/**
 * Decodes the common slide fields and the pair's fields, rejecting spelling mistakes.
 *
 * @param fields - The authored slide frontmatter without its layout name.
 */
function decode(fields: Record<string, unknown>): unknown {
  const schema = Schema.Struct({
    ...SlideFrontmatter.fields,
    ...beforeAfterLayoutContract.schema.fields,
  });
  return Schema.decodeUnknownSync(schema)(
    { layout: 'before-after', ...fields },
    { onExcessProperty: 'error' },
  );
}

describe('the before-after layout contract', () => {
  it('requires exactly a before and an after picture, each with a source and description', () => {
    expect(() => decode({ before: PICTURE, after: PICTURE })).not.toThrow();
    expect(() => decode({ before: PICTURE })).toThrow('after');
    expect(() => decode({ after: PICTURE })).toThrow('before');
    expect(() => decode({ before: { src: PICTURE.src }, after: PICTURE })).toThrow('alt');
    expect(() => decode({ before: PICTURE, after: { alt: PICTURE.alt } })).toThrow('src');
    expect(() => decode({ before: PICTURE, after: PICTURE, third: PICTURE })).toThrow('excess');
  });

  it('defaults to named sides, whole pictures, a highlighted after and visible chrome', () => {
    expect(decode({ before: PICTURE, after: PICTURE })).toMatchObject({
      before: { label: 'Before' },
      after: { label: 'After' },
      fit: 'contain',
      accent: 'after',
      reveal: false,
      chrome: true,
    });
  });

  it('shares one fit across the pair, with custom labels, focal points and an optional reveal', () => {
    expect(
      decode({
        before: { ...PICTURE, label: '2023', focal: 'top' },
        after: { ...PICTURE, label: '2026', caption: 'Shade reaches both pavements' },
        fit: 'cover',
        accent: 'none',
        reveal: true,
        treatment: 'plain',
      }),
    ).toMatchObject({ fit: 'cover', accent: 'none', reveal: true });
    expect(() => decode({ before: PICTURE, after: PICTURE, highlight: true })).toThrow('excess');
    expect(() => decode({ before: PICTURE, after: PICTURE, accent: 'before' })).toThrow('accent');
    expect(() => decode({ before: PICTURE, after: PICTURE, fit: 'stretch' })).toThrow(
      'Expected "contain"',
    );
    expect(() => decode({ before: { ...PICTURE, fit: 'cover' }, after: PICTURE })).toThrow(
      'Expected no excess property',
    );
  });

  it('bounds both sides equally and rejects empty accessible descriptions', () => {
    for (const side of ['before', 'after']) {
      for (const [field, limit] of [
        ['alt', BEFORE_AFTER_ALT_MAX_CHARS],
        ['label', BEFORE_AFTER_LABEL_MAX_CHARS],
        ['caption', BEFORE_AFTER_CAPTION_MAX_CHARS],
      ] as const) {
        expect(() =>
          decode({
            before: PICTURE,
            after: PICTURE,
            [side]: { ...PICTURE, [field]: 'x'.repeat(limit) },
          }),
        ).not.toThrow();
        expect(() =>
          decode({
            before: PICTURE,
            after: PICTURE,
            [side]: { ...PICTURE, [field]: 'x'.repeat(limit + 1) },
          }),
        ).toThrow(`at most ${limit} characters`);
      }
    }

    expect(() => decode({ before: { ...PICTURE, alt: '' }, after: PICTURE })).toThrow('alt');
  });

  it('provides filled and bare stress cases for both fits and maps to two-content PowerPoint', () => {
    const cases = LIMIT_CASES['before-after'] ?? [];
    expect(cases.map((item) => item.name)).toEqual([
      'contain',
      'contain-bare',
      'cover',
      'cover-bare',
    ]);
    for (const item of cases) {
      expect(() => decode(item.frontmatter)).not.toThrow();
    }

    expect(beforeAfterLayoutContract.pptx?.type).toBe('two-content');
  });
});
