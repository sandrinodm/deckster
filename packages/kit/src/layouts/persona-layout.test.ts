import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import {
  DEFAULT_PERSONA_LABELS,
  MAX_PERSONA_ITEMS,
  PERSONA_LABEL_MAX_CHARS,
  PERSONA_ITEM_MAX_CHARS,
  PERSONA_NAME_MAX_CHARS,
  PERSONA_ROLE_MAX_CHARS,
  personaLayoutContract,
} from '#layouts/persona-layout.contract.ts';

/**
 * A participant with the minimum research lists.
 */
const PERSONA = {
  name: 'Dana Okafor',
  role: 'Volunteer tree warden',
  goals: ['Keep the trees alive', 'Share the rounds'],
  frustrations: ['Unclear advice', 'No holiday cover'],
};

/**
 * Decodes the shared slide fields and the persona fields, rejecting excess properties.
 */
function decode(frontmatter: Record<string, unknown>): unknown {
  const schema = Schema.Struct({
    ...SlideFrontmatter.fields,
    ...personaLayoutContract.schema.fields,
  });
  return Schema.decodeUnknownSync(schema)(
    { layout: 'persona', ...frontmatter },
    { onExcessProperty: 'error' },
  );
}

describe('the persona layout contract', () => {
  it('requires a name, role and two to four items in each list', () => {
    expect(() => decode(PERSONA)).not.toThrow();
    for (const field of ['name', 'role', 'goals', 'frustrations']) {
      const missing: Record<string, unknown> = { ...PERSONA };
      delete missing[field];
      expect(() => decode(missing)).toThrow(field);
    }

    for (const field of ['goals', 'frustrations']) {
      expect(() => decode({ ...PERSONA, [field]: ['Only one'] })).toThrow('at least 2');
      expect(() =>
        decode({ ...PERSONA, [field]: Array(MAX_PERSONA_ITEMS).fill('Item') }),
      ).not.toThrow();
      expect(() =>
        decode({ ...PERSONA, [field]: Array(MAX_PERSONA_ITEMS + 1).fill('Item') }),
      ).toThrow('at most 4');
    }
  });

  it('enforces the published text limits on identity and both lists', () => {
    for (const [field, limit] of [
      ['name', PERSONA_NAME_MAX_CHARS],
      ['role', PERSONA_ROLE_MAX_CHARS],
    ] as const) {
      expect(() => decode({ ...PERSONA, [field]: 'x'.repeat(limit) })).not.toThrow();
      expect(() => decode({ ...PERSONA, [field]: 'x'.repeat(limit + 1) })).toThrow(
        `at most ${limit}`,
      );
    }

    for (const field of ['goals', 'frustrations']) {
      expect(() =>
        decode({ ...PERSONA, [field]: ['x'.repeat(PERSONA_ITEM_MAX_CHARS), 'Short'] }),
      ).not.toThrow();
      expect(() =>
        decode({ ...PERSONA, [field]: ['x'.repeat(PERSONA_ITEM_MAX_CHARS + 1), 'Short'] }),
      ).toThrow(`at most ${PERSONA_ITEM_MAX_CHARS}`);
    }
  });

  it('defaults the labels and accepts custom headings at the character limit', () => {
    expect(decode(PERSONA)).toMatchObject({ labels: DEFAULT_PERSONA_LABELS });
    expect(decode({ ...PERSONA, labels: {} })).toMatchObject({ labels: DEFAULT_PERSONA_LABELS });
    for (const field of ['goals', 'frustrations']) {
      expect(
        decode({ ...PERSONA, labels: { [field]: 'x'.repeat(PERSONA_LABEL_MAX_CHARS) } }),
      ).toMatchObject({ labels: { [field]: 'x'.repeat(PERSONA_LABEL_MAX_CHARS) } });
      expect(() =>
        decode({ ...PERSONA, labels: { [field]: 'x'.repeat(PERSONA_LABEL_MAX_CHARS + 1) } }),
      ).toThrow(`at most ${PERSONA_LABEL_MAX_CHARS}`);
    }
  });

  it('uses the bio portrait fields and shows chrome by default', () => {
    expect(decode(PERSONA)).toMatchObject({ chrome: true });
    expect(
      decode({
        ...PERSONA,
        photo: 'assets/dana.svg',
        focal: 'center 30%',
        treatment: 'plain',
        chrome: false,
      }),
    ).toMatchObject({ focal: 'center 30%', chrome: false });
    expect(() => decode({ ...PERSONA, focal: 'outside' })).toThrow('Expected a focal point');
    expect(() => decode({ ...PERSONA, treatment: 'Not a treatment' })).toThrow(
      'Expected a treatment',
    );
  });

  it('maps the assertion and quotation to PowerPoint placeholders', () => {
    expect(personaLayoutContract.pptx).toMatchObject({
      type: 'two-content',
      placeholders: [{ kind: 'title' }, { kind: 'body' }],
    });
  });
});
