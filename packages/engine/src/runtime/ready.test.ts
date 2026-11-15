// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { createReadinessRegistry } from '#readiness/readiness-registry.ts';
import { READY_TIMEOUT_MS, waitUntilReady } from '#runtime/ready.ts';

/**
 * A deck root with one active section for slide 0.
 */
function makeRoot(): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = '<section data-slide-active data-slide-index="0"></section>';
  document.body.append(root);
  return root;
}

/**
 * Replaces `document.fonts` with a controllable one.
 *
 * @param status - The fonts' status.
 * @param ready - The promise `document.fonts.ready` gives.
 */
function stubFonts(status: string, ready: Promise<unknown>): void {
  Object.defineProperty(document, 'fonts', { value: { status, ready }, configurable: true });
}

/**
 * Lets a pending `waitUntilReady` settle, observing whether it did.
 *
 * @param promise - The call.
 */
function observe(promise: Promise<void>): {
  state: 'pending' | 'resolved' | 'rejected';
  error: unknown;
} {
  const result = {
    state: 'pending' as 'pending' | 'resolved' | 'rejected',
    error: undefined as unknown,
  };
  promise.then(
    () => {
      result.state = 'resolved';
    },
    (error: unknown) => {
      result.state = 'rejected';
      result.error = error;
    },
  );
  return result;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  Reflect.deleteProperty(document, 'fonts');
});

describe('waitUntilReady', () => {
  it('resolves when nothing is held, loading or pending', async () => {
    stubFonts('loaded', Promise.resolve());
    const done = observe(
      waitUntilReady({ root: makeRoot(), slides: [0], readiness: createReadinessRegistry() }),
    );
    await vi.advanceTimersByTimeAsync(200);
    expect(done.state).toBe('resolved');
  });

  it('does not resolve while a hold taken during the font wait is outstanding', async () => {
    let fontsLoaded: () => void = () => undefined;
    stubFonts('loaded', new Promise<void>((resolve) => (fontsLoaded = resolve)));
    const readiness = createReadinessRegistry();
    const done = observe(waitUntilReady({ root: makeRoot(), slides: [0], readiness }));
    await vi.advanceTimersByTimeAsync(100);
    const release = readiness.hold(0);
    fontsLoaded();
    await vi.advanceTimersByTimeAsync(200);
    expect(done.state).toBe('pending');
    release();
    await vi.advanceTimersByTimeAsync(200);
    expect(done.state).toBe('resolved');
  });

  it('rejects after the timeout naming the held slide, and removes its waiter', async () => {
    stubFonts('loaded', Promise.resolve());
    const readiness = createReadinessRegistry();
    readiness.hold(0);
    const done = observe(waitUntilReady({ root: makeRoot(), slides: [0], readiness }));
    await vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS + 100);
    expect(done.state).toBe('rejected');
    expect(String(done.error)).toContain('ready() gave up after 30s: slide 1 is still held.');
  });

  it('rejects when web fonts never finish, naming them', async () => {
    stubFonts('loading', new Promise(() => undefined));
    const done = observe(
      waitUntilReady({ root: makeRoot(), slides: [0], readiness: createReadinessRegistry() }),
    );
    await vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS + 100);
    expect(done.state).toBe('rejected');
    expect(String(done.error)).toContain('web fonts are still loading');
  });

  it('rejects when an image never loads, naming it, and removes its listeners', async () => {
    stubFonts('loaded', Promise.resolve());
    const root = makeRoot();
    const image = document.createElement('img');
    image.src = 'http://localhost/never.png';
    Object.defineProperty(image, 'complete', { value: false });
    root.querySelector('section')?.append(image);
    const added = vi.spyOn(image, 'addEventListener');
    const removed = vi.spyOn(image, 'removeEventListener');
    const done = observe(
      waitUntilReady({ root, slides: [0], readiness: createReadinessRegistry() }),
    );
    await vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS + 100);
    expect(done.state).toBe('rejected');
    expect(String(done.error)).toContain('image http://localhost/never.png has not loaded');
    expect(added.mock.calls.map(([type]) => type).toSorted()).toEqual(['error', 'load']);
    expect(removed.mock.calls.map(([type]) => type)).toEqual(
      expect.arrayContaining(['error', 'load']),
    );
  });

  it('rejects when the requested step never lands', async () => {
    stubFonts('loaded', Promise.resolve());
    const done = observe(
      waitUntilReady({
        root: makeRoot(),
        slides: [0],
        readiness: createReadinessRegistry(),
        isPending: () => true,
      }),
    );
    await vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS + 100);
    expect(done.state).toBe('rejected');
    expect(String(done.error)).toContain('the step the deck was sent to never landed');
  });
});
