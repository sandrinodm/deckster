import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { connectDeck, errorText, MAX_ERROR_LENGTH } from '#client/connect-deck.ts';

/**
 * A page embedded in a deck: a window whose parent records what it is sent.
 */
function embeddedWindow(): { window: EventTarget; sent: unknown[] } {
  const sent: unknown[] = [];
  const parent = { postMessage: (message: unknown) => sent.push(message) };
  const page = Object.assign(new EventTarget(), {
    parent,
    location: { origin: 'http://deck.test' },
  });
  return { window: page, sent };
}

/**
 * The `type` of every message a page sent.
 *
 * @param sent - The posted envelopes.
 */
function types(sent: readonly unknown[]): unknown[] {
  return sent.map((envelope) => (envelope as { type?: string }).type);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('connectDeck', () => {
  it('reports an uncaught error and an unhandled rejection to the deck by default', () => {
    const { window: page, sent } = embeddedWindow();
    vi.stubGlobal('window', page);
    vi.stubGlobal('document', { referrer: '', hasFocus: () => false });
    const connection = connectDeck();
    const error = Object.assign(new Event('error'), { error: new TypeError('x is undefined') });
    page.dispatchEvent(error);
    const rejection = Object.assign(new Event('unhandledrejection'), { reason: 'no network' });
    page.dispatchEvent(rejection);
    expect(types(sent)).toEqual(['hello', 'error', 'error']);
    expect(JSON.stringify(sent[1])).toContain('TypeError: x is undefined');
    expect(JSON.stringify(sent[2])).toContain('no network');
    connection.dispose();
    page.dispatchEvent(error);
    expect(sent).toHaveLength(3);
  });

  it('leaves errors alone when told not to report them', () => {
    const { window: page, sent } = embeddedWindow();
    vi.stubGlobal('window', page);
    vi.stubGlobal('document', { referrer: '', hasFocus: () => false });
    connectDeck({ reportErrors: false });
    page.dispatchEvent(Object.assign(new Event('error'), { error: new Error('boom') }));
    expect(types(sent)).toEqual(['hello']);
  });
});

describe('errorText', () => {
  it('names the error class, but not a plain Error', () => {
    expect(errorText(new RangeError('too far'))).toBe('RangeError: too far');
    expect(errorText(new Error('boom'))).toBe('boom');
    expect(errorText(42)).toBe('42');
    expect(errorText('')).toBe('The app failed without a message.');
  });

  it('cuts a long message', () => {
    const text = errorText('x'.repeat(MAX_ERROR_LENGTH * 2));
    expect(text).toHaveLength(MAX_ERROR_LENGTH);
    expect(text.endsWith('…')).toBe(true);
  });
});
