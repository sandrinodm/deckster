import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { fieldLimitBreaches, slideFieldLimits } from '@deckster/engine/layout';
import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import {
  VOICE_NAME_MAX_CHARS,
  VOICE_NAME_MAX_CHARS_IN_THREE,
  VOICE_QUOTE_MAX_CHARS,
  VOICE_QUOTE_MAX_CHARS_IN_THREE,
  VOICE_ROLE_MAX_CHARS,
  voicesLayoutContract,
} from '#layouts/voices-layout.contract.ts';

/**
 * A complete testimonial without a portrait.
 */
const VOICE = {
  quote: 'We walk to school under the trees now.',
  name: 'Sam Okafor',
  role: 'Eastgate parent',
};

/**
 * Decodes the shared frontmatter and the voices fields, rejecting misspelled fields too.
 *
 * @param frontmatter - The slide fields without layout.
 */
function decode(frontmatter: Record<string, unknown>): unknown {
  const schema = Schema.Struct({
    ...SlideFrontmatter.fields,
    ...voicesLayoutContract.schema.fields,
  });
  return Schema.decodeUnknownSync(schema)(
    { layout: 'voices', ...frontmatter },
    { onExcessProperty: 'error' },
  );
}

describe('the voices layout contract', () => {
  it('takes two or three attributed testimonials', () => {
    expect(() => decode({ voices: [VOICE, VOICE] })).not.toThrow();
    expect(() => decode({ voices: [VOICE, VOICE, VOICE] })).not.toThrow();
    expect(() => decode({ voices: [VOICE] })).toThrow('at least 2 voices');
    expect(() => decode({ voices: Array(4).fill(VOICE) })).toThrow('at most 3 voices');
    expect(() => decode({ voices: [{ quote: 'Words', name: 'Sam' }, VOICE] })).toThrow('role');
    expect(() => decode({ voices: [{ ...VOICE, quote: '' }, VOICE] })).toThrow(
      'a length of at least 1',
    );
  });

  it('defaults to all speakers together, with optional portraits and treatment', () => {
    expect(decode({ voices: [VOICE, VOICE] })).toMatchObject({ chrome: true, reveal: false });
    expect(
      decode({
        voices: [{ ...VOICE, photo: 'assets/sam.svg', focal: 'center 30%' }, VOICE],
        treatment: 'plain',
        reveal: true,
        chrome: false,
      }),
    ).toMatchObject({ reveal: true, chrome: false, treatment: 'plain' });
  });

  it('limits the quote, name and role and rejects unknown nested fields', () => {
    for (const [field, max] of [
      ['quote', VOICE_QUOTE_MAX_CHARS],
      ['name', VOICE_NAME_MAX_CHARS],
      ['role', VOICE_ROLE_MAX_CHARS],
    ] as const) {
      expect(() =>
        decode({ voices: [{ ...VOICE, [field]: 'x'.repeat(max) }, VOICE] }),
      ).not.toThrow();
      expect(() => decode({ voices: [{ ...VOICE, [field]: 'x'.repeat(max + 1) }, VOICE] })).toThrow(
        `at most ${max} characters`,
      );
    }

    expect(() => decode({ voices: [{ ...VOICE, caption: 'Wrong field' }, VOICE] })).toThrow(
      'Expected no excess property',
    );
  });

  it('shortens quotes and names when three speakers share the row', () => {
    const voice = {
      ...VOICE,
      quote: 'x'.repeat(VOICE_QUOTE_MAX_CHARS_IN_THREE + 1),
      name: 'x'.repeat(VOICE_NAME_MAX_CHARS_IN_THREE + 1),
    };
    const limits = (voices: readonly unknown[]) =>
      slideFieldLimits(voicesLayoutContract, { frontmatter: { voices }, filled: [] });
    const pair = [voice, VOICE];
    const three = [...pair, VOICE];
    expect(fieldLimitBreaches({ voices: pair }, limits(pair))).toEqual([]);
    expect(
      fieldLimitBreaches({ voices: three }, limits(three)).map((breach) => breach.path),
    ).toEqual(['voices[0].quote', 'voices[0].name']);
  });

  it('maps the title and context to PowerPoint placeholders', () => {
    expect(voicesLayoutContract.pptx).toMatchObject({
      type: 'title-only',
      placeholders: [{ kind: 'title' }, { kind: 'body' }],
    });
  });
});
