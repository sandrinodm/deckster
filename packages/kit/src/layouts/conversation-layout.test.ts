import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import {
  conversationLayoutContract,
  MESSAGE_NAME_MAX_CHARS,
  MESSAGE_ROLE_MAX_CHARS,
  MESSAGE_TEXT_MAX_CHARS,
} from '#layouts/conversation-layout.contract.ts';

/**
 * A turn with every optional speaker field.
 */
const MESSAGE = { name: 'Maya', side: 'left', text: 'Can we plant here?', role: 'Resident' };

/**
 * Decodes frontmatter exactly as the build does, rejecting unknown fields.
 */
function decode(frontmatter: Record<string, unknown>): unknown {
  const schema = Schema.Struct({
    ...SlideFrontmatter.fields,
    ...conversationLayoutContract.schema.fields,
  });
  return Schema.decodeUnknownSync(schema)(
    { layout: 'conversation', ...frontmatter },
    { onExcessProperty: 'error' },
  );
}

describe('the conversation layout contract', () => {
  it('takes two to four messages with names, sides and text', () => {
    for (const count of [2, 3, 4]) {
      expect(() => decode({ messages: Array(count).fill(MESSAGE) })).not.toThrow();
    }

    expect(() => decode({ messages: [MESSAGE] })).toThrow('at least 2 messages');
    expect(() => decode({ messages: Array(5).fill(MESSAGE) })).toThrow('at most 4 messages');
    for (const field of ['name', 'side', 'text']) {
      const missing = Object.fromEntries(Object.entries(MESSAGE).filter(([key]) => key !== field));
      expect(() => decode({ messages: [MESSAGE, missing] })).toThrow(
        new RegExp(`messages[\\s\\S]*\\[1\\][\\s\\S]*${field}`),
      );
    }
  });

  it('accepts both sides and an omitted role, with reveal off and chrome on by default', () => {
    expect(
      decode({ messages: [MESSAGE, { name: 'Dana', side: 'right', text: 'Yes.' }] }),
    ).toMatchObject({ reveal: false, chrome: true });
    expect(() => decode({ messages: [MESSAGE, { ...MESSAGE, side: 'centre' }] })).toThrow('side');
    expect(() => decode({ messages: [MESSAGE, { ...MESSAGE, colour: 'blue' }] })).toThrow(
      'Expected no excess property',
    );
  });

  it('bounds every speaker field and message', () => {
    for (const [field, limit] of [
      ['name', MESSAGE_NAME_MAX_CHARS],
      ['role', MESSAGE_ROLE_MAX_CHARS],
      ['text', MESSAGE_TEXT_MAX_CHARS],
    ] as const) {
      expect(() =>
        decode({ messages: [MESSAGE, { ...MESSAGE, [field]: 'x'.repeat(limit) }] }),
      ).not.toThrow();
      expect(() =>
        decode({ messages: [MESSAGE, { ...MESSAGE, [field]: 'x'.repeat(limit + 1) }] }),
      ).toThrow(`at most ${limit} characters`);
    }
  });

  it('rejects the former speaker field', () => {
    expect(() => decode({ messages: [MESSAGE, { ...MESSAGE, from: MESSAGE.name }] })).toThrow(
      'Expected no excess property',
    );
  });

  it('maps native text to a PowerPoint title-only slide', () => {
    expect(conversationLayoutContract.pptx).toMatchObject({
      type: 'title-only',
      placeholders: [{ kind: 'title' }, { kind: 'body' }],
    });
  });
});
