import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { DECK_COMMAND_ENV, deckCommand } from '#contract/deck-command.ts';

describe('deckCommand', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('names the repository command when nothing says otherwise', () => {
    vi.stubEnv(DECK_COMMAND_ENV, '');

    expect(deckCommand()).toBe('pnpm deck');
  });

  it('names the command the published CLI set', () => {
    vi.stubEnv(DECK_COMMAND_ENV, 'deck');

    expect(deckCommand()).toBe('deck');
  });
});
