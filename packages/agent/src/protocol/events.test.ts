import { describe, expect, it } from 'vite-plus/test';

import { decodeClientMessage } from '#protocol/events.ts';

describe('the messages the agent host accepts', () => {
  it('bypass 4 (page approves): there is no approve-config message, so page code cannot approve anything', () => {
    const approve = decodeClientMessage(
      JSON.stringify({ type: 'approve-config', file: 'decks/hello/deck.config.ts' }),
    );
    expect(approve._tag).toBe('Failure');
  });

  it('accepts only what the panel’s own controls send', () => {
    for (const message of [
      { type: 'prompt', text: 'Shorter' },
      { type: 'cancel' },
      { type: 'undo', turn: 1 },
      { type: 'redo' },
      { type: 'new-conversation' },
      { type: 'set-model', model: null },
      { type: 'diff', turn: 1 },
    ]) {
      expect(decodeClientMessage(JSON.stringify(message))._tag, message.type).toBe('Success');
    }
  });
});
