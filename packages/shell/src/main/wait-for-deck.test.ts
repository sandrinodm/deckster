import { describe, expect, it } from 'vite-plus/test';

import { deckAppearsScript, waitForDeck, type DeckContents } from '#main/wait-for-deck.ts';

const TIMES = { appearsMs: 400, readyMs: 100, attemptMs: 40, retryMs: 5 };

/**
 * Fake contents whose scripts answer from a list, one answer per call.
 *
 * @param answers - What each call does: a value, a rejection or a promise that never settles.
 */
function contents(answers: Array<'reject' | 'hang' | boolean>) {
  const calls: string[] = [];
  const fake: DeckContents = {
    executeJavaScript: (code) => {
      calls.push(code);
      const answer = answers.shift() ?? true;
      if (answer === 'reject') {
        return Promise.reject(new Error('Script failed to execute'));
      }

      return answer === 'hang' ? new Promise(() => undefined) : Promise.resolve(answer);
    },
    isDestroyed: () => false,
  };
  return { fake, calls };
}

describe('waiting for the deck to appear', () => {
  it('asks the page once, with the time left, instead of polling', () => {
    const script = deckAppearsScript(8000);
    expect(script).toContain('window.__deck?.ready');
    expect(script).toContain('8000');
    expect(deckAppearsScript(-5)).toContain('Date.now() + 0');
  });

  it('succeeds at once when the deck is there, then waits for ready', async () => {
    const { fake, calls } = contents([true, true]);
    await expect(waitForDeck(fake, TIMES)).resolves.toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain('__deck.ready()');
  });

  it('retries after a rejected script (a navigation) and then succeeds', async () => {
    const { fake, calls } = contents(['reject', 'reject', true, true]);
    await expect(waitForDeck(fake, TIMES)).resolves.toBe(true);
    expect(calls).toHaveLength(4);
  });

  it('gives up on an attempt whose promise never settles and asks again', async () => {
    const started = Date.now();
    const { fake, calls } = contents(['hang', true, true]);
    await expect(waitForDeck(fake, TIMES)).resolves.toBe(true);
    expect(calls).toHaveLength(3);
    expect(Date.now() - started).toBeLessThan(TIMES.appearsMs);
  });

  it('reports no deck at the deadline', async () => {
    const { fake } = contents(Array.from({ length: 200 }, () => false));
    const started = Date.now();
    await expect(waitForDeck(fake, TIMES)).resolves.toBe(false);
    expect(Date.now() - started).toBeGreaterThanOrEqual(TIMES.appearsMs - 5);
  });

  it('reports the deck anyway when ready() takes too long', async () => {
    const { fake } = contents([true, 'hang']);
    const started = Date.now();
    await expect(waitForDeck(fake, TIMES)).resolves.toBe(true);
    expect(Date.now() - started).toBeLessThan(TIMES.appearsMs);
  });

  it('stops when the contents are destroyed', async () => {
    await expect(
      waitForDeck(
        { executeJavaScript: () => Promise.resolve(false), isDestroyed: () => true },
        TIMES,
      ),
    ).resolves.toBe(false);
  });
});
