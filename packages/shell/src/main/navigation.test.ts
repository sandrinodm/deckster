import { describe, expect, it } from 'vite-plus/test';

import { classifyNavigation, decideWindowOpen, presenterUrlFor } from '#main/navigation.ts';

const ORIGIN = 'http://127.0.0.1:5173';

describe('navigation', () => {
  it('keeps only the deck server inside the app', () => {
    expect(classifyNavigation(`${ORIGIN}/#/2/1`, ORIGIN)).toBe('internal');
    expect(classifyNavigation('https://example.com/', ORIGIN)).toBe('external');
    expect(classifyNavigation('http://127.0.0.1:9999/', ORIGIN)).toBe('external');
    expect(classifyNavigation('mailto:a@example.com', ORIGIN)).toBe('external');
  });

  it('refuses other schemes and garbage', () => {
    expect(classifyNavigation('file:///etc/passwd', ORIGIN)).toBe('blocked');
    expect(classifyNavigation('javascript:alert(1)', ORIGIN)).toBe('blocked');
    expect(classifyNavigation('data:text/html,hi', ORIGIN)).toBe('blocked');
    expect(classifyNavigation('not a url', ORIGIN)).toBe('blocked');
  });

  it('turns the presenter popup into the presenter window', () => {
    expect(decideWindowOpen('', 'deck-presenter', ORIGIN, false)).toBe('presenter-popup');
    expect(decideWindowOpen(`${ORIGIN}/?presenter#/1/0`, 'deck-presenter', ORIGIN, false)).toBe(
      'presenter-popup',
    );
    expect(decideWindowOpen(`${ORIGIN}/?presenter`, 'deck-presenter', ORIGIN, true)).toBe(
      'focus-presenter',
    );
  });

  it('does not let the presenter name open a foreign page inside the app', () => {
    expect(decideWindowOpen('https://example.com/', 'deck-presenter', ORIGIN, false)).toBe(
      'external',
    );
    expect(decideWindowOpen('file:///x', 'deck-presenter', ORIGIN, false)).toBe('blocked');
  });

  it('sends every other window.open through the same rules', () => {
    expect(decideWindowOpen('https://example.com/', '', ORIGIN, false)).toBe('external');
    expect(decideWindowOpen(`${ORIGIN}/other`, '_blank', ORIGIN, false)).toBe('internal');
  });

  it('builds the presenter URL with the position', () => {
    expect(presenterUrlFor(`${ORIGIN}/#/3/1`)).toBe(`${ORIGIN}/?presenter#/3/1`);
    expect(presenterUrlFor(`${ORIGIN}/decks/x/?brand=a#/1/0`)).toBe(
      `${ORIGIN}/decks/x/?presenter#/1/0`,
    );
  });
});
