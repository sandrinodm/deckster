import { describe, expect, it } from 'vite-plus/test';

import { acceptAppMessage, acceptDeckMessage } from '#protocol/message-guard.ts';
import { envelope, isAppMessage, isDeckMessage } from '#protocol/messages.ts';

/**
 * A window stand-in; the guard only compares identity.
 */
const APP_WINDOW = { name: 'app' };

/**
 * Another window, such as an ad frame on the same page.
 */
const OTHER_WINDOW = { name: 'other' };

/**
 * The origin the app is served from in these tests.
 */
const ORIGIN = 'http://localhost:5300';

/**
 * A complete `init` payload.
 */
const INIT = {
  type: 'init',
  brand: {
    name: 'default',
    label: 'Default',
    surface: 'default',
    scheme: 'light',
    roles: { fg: '#111111' },
    background: '#ffffff',
    fonts: { body: 'Inter' },
    type: { body: { family: 'Inter', size: 32, lineHeight: 1.4, weight: 400 } },
    radius: { md: 8 },
    stroke: { regular: 2 },
    space: { md: 24 },
    shadow: { sm: 'none' },
    data: { categorical: ['#ff0000'], context: '#999999' },
  },
  cssVariables: { '--brand-color-fg': '#111111' },
  fontFaces: '',
  scheme: 'light',
  slide: { index: 2, id: 'agent' },
  step: 0,
  active: true,
  static: false,
} as const;

describe('bridge messages', () => {
  it('accepts every deck message shape', () => {
    const payloads = [
      INIT,
      { type: 'activate' },
      { type: 'deactivate' },
      { type: 'step', step: 3 },
      { type: 'static', static: true },
    ];
    for (const payload of payloads) {
      expect(isDeckMessage(envelope(payload)), payload.type).toBe(true);
    }
  });

  it('accepts every app message shape', () => {
    const payloads = [
      { type: 'hello' },
      { type: 'ready' },
      { type: 'requestSteps', count: 5 },
      { type: 'next' },
      { type: 'prev' },
      { type: 'resize', height: 480 },
      { type: 'resize' },
      { type: 'error', message: 'It broke.' },
      { type: 'release' },
      { type: 'focus', focused: true },
    ];
    for (const payload of payloads) {
      expect(isAppMessage(envelope(payload)), payload.type).toBe(true);
    }
  });

  it('rejects messages of another channel, version or shape', () => {
    const ready = envelope({ type: 'ready' });
    expect(isAppMessage({ ...ready, channel: 'someone-else' })).toBe(false);
    expect(isAppMessage({ ...ready, version: 2 })).toBe(false);
    expect(isAppMessage({ type: 'ready' })).toBe(false);
    expect(isAppMessage(envelope({ type: 'requestSteps', count: -1 }))).toBe(false);
    expect(isAppMessage(envelope({ type: 'requestSteps', count: 1000 }))).toBe(false);
    expect(isAppMessage(envelope({ type: 'requestSteps', count: 1.5 }))).toBe(false);
    expect(isAppMessage(envelope({ type: 'requestSteps' }))).toBe(false);
    expect(isAppMessage(envelope({ type: 'error', message: 7 }))).toBe(false);
    expect(isAppMessage(envelope({ type: 'focus', focused: 'yes' }))).toBe(false);
    expect(isAppMessage(envelope({ type: 'activate' }))).toBe(false);
    expect(isAppMessage('ready')).toBe(false);
    expect(isAppMessage(null)).toBe(false);
  });

  it('rejects a malformed init', () => {
    expect(isDeckMessage(envelope({ ...INIT, step: 'one' }))).toBe(false);
    expect(isDeckMessage(envelope({ ...INIT, scheme: 'sepia' }))).toBe(false);
    expect(isDeckMessage(envelope({ type: 'init' }))).toBe(false);
  });
});

describe('message guards', () => {
  const sender = { origin: ORIGIN, window: APP_WINDOW };
  const ready = envelope({ type: 'ready' });

  it('accepts a valid message from the app window and origin', () => {
    expect(acceptAppMessage({ origin: ORIGIN, source: APP_WINDOW, data: ready }, sender)).toEqual(
      ready,
    );
  });

  it('drops a message from another window or origin', () => {
    expect(
      acceptAppMessage({ origin: ORIGIN, source: OTHER_WINDOW, data: ready }, sender),
    ).toBeUndefined();
    expect(
      acceptAppMessage({ origin: 'https://evil.example', source: APP_WINDOW, data: ready }, sender),
    ).toBeUndefined();
  });

  it('drops a message of the wrong direction', () => {
    const data = envelope({ type: 'activate' });
    expect(acceptAppMessage({ origin: ORIGIN, source: APP_WINDOW, data }, sender)).toBeUndefined();
    expect(acceptDeckMessage({ origin: ORIGIN, source: APP_WINDOW, data }, sender)).toEqual(data);
  });
});
