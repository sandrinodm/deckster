import { describe, expect, it } from 'vite-plus/test';

import { APP_NAME } from '#bundle/app-identity.ts';
import { appTitle, windowTitle } from '#main/window-title.ts';

describe('the shell’s titles', () => {
  it('names the app and the deck window after the deck, prefixed with the product', () => {
    expect(APP_NAME).toBe('Deckster');
    expect(appTitle('Slides an agent can write')).toBe('Deckster: Slides an agent can write');
    expect(windowTitle('Hello, deck', 'audience')).toBe('Deckster: Hello, deck');
  });

  it('marks the presenter window', () => {
    expect(windowTitle('Hello, deck', 'presenter')).toBe('Deckster: Hello, deck · Presenter');
  });
});
