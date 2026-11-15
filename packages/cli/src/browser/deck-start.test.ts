import { describe, expect, it } from 'vite-plus/test';

import {
  shownFile,
  startFailureMessage,
  waitForStart,
  type ReportedProblem,
  type StartState,
  type StartTiming,
} from '#browser/deck-start.ts';

/**
 * The workspace the paths in these tests sit in.
 */
const ROOT = '/work/talks';

/**
 * Short timings, so a test never waits long: the clock is fake, only the polling sleeps.
 */
const TIMING: StartTiming = { timeoutMs: 30_000, graceMs: 2000, pollMs: 1 };

/**
 * The browser's error for an import of a name the helper does not export.
 */
const LINK_ERROR =
  "SyntaxError: The requested module '/@fs/work/talks/decks/q3/slides/helper.ts' does not " +
  "provide an export named 'farewell'";

/**
 * A page that has not started, shows no overlay and lists nothing.
 */
const BLANK: StartState = { started: false, overlay: null, panel: [] };

/**
 * A fake page: each poll reads the next state (the last one repeats) and moves the clock by
 * `stepMs`; `reported` lists what arrived by the current time.
 *
 * @param states - The states the page shows, in order.
 * @param reported - The problems the browser reports, with when they arrive.
 * @param stepMs - How far the clock moves per poll.
 */
function fakePage(
  states: readonly StartState[],
  reported: readonly ReportedProblem[] = [],
  stepMs = 500,
) {
  let time = 0;
  let polls = 0;
  return {
    polls: () => polls,
    now: () => time,
    watch: {
      state: async () => {
        const state = states[Math.min(polls, states.length - 1)] ?? BLANK;
        polls += 1;
        time += stepMs;
        return state;
      },
      reported: () => reported.filter((problem) => problem.at <= time),
    },
  };
}

describe('waitForStart', () => {
  it('returns as soon as the deck has started', async () => {
    const page = fakePage([BLANK, { ...BLANK, started: true }]);
    expect(await waitForStart(page.watch, TIMING, page.now)).toEqual({ kind: 'started' });
    expect(page.polls()).toBe(2);
  });

  it("fails at once on Vite's overlay, with its message and file", async () => {
    const overlay = {
      message: 'Unexpected token (3:4)',
      file: '/work/talks/decks/q3/slides/a.tsx:3:4',
    };
    const page = fakePage([{ ...BLANK, overlay }]);
    expect(await waitForStart(page.watch, TIMING, page.now)).toEqual({
      kind: 'failed',
      problems: [overlay],
    });
    expect(page.polls()).toBe(1);
  });

  it('fails after the grace on a page error the deck does not recover from, naming the panel file', async () => {
    const panel = [{ message: LINK_ERROR, file: '/work/talks/decks/q3/slides/bye.tsx' }];
    const page = fakePage([{ ...BLANK, panel }], [{ message: LINK_ERROR, file: '', at: 0 }]);
    const outcome = await waitForStart(page.watch, TIMING, page.now);
    expect(outcome).toEqual({ kind: 'failed', problems: panel });
    expect(page.now()).toBeLessThan(TIMING.timeoutMs / 10);
  });

  it('falls back to what the browser reported when the panel lists nothing', async () => {
    const failed = { message: 'The server answered 404 for the module /x.ts.', file: '/x.ts' };
    const page = fakePage([BLANK], [{ ...failed, at: 0 }]);
    expect(await waitForStart(page.watch, TIMING, page.now)).toEqual({
      kind: 'failed',
      problems: [failed],
    });
  });

  it('lets a deck that starts after an early error start, so the error becomes a finding', async () => {
    const page = fakePage(
      [BLANK, BLANK, { ...BLANK, started: true }],
      [{ message: 'Error: early', file: '', at: 0 }],
    );
    expect(await waitForStart(page.watch, TIMING, page.now)).toEqual({ kind: 'started' });
  });

  it('times out on a deck that hangs without an error', async () => {
    const page = fakePage([BLANK], [], 5000);
    expect(await waitForStart(page.watch, TIMING, page.now)).toEqual({ kind: 'timeout' });
    expect(page.now()).toBeGreaterThanOrEqual(TIMING.timeoutMs);
  });
});

describe('startFailureMessage', () => {
  it('names the importing file, the module and the missing name, with the fix', () => {
    const message = startFailureMessage(
      [{ message: LINK_ERROR, file: '/work/talks/decks/q3/slides/bye.tsx' }],
      ROOT,
    );
    expect(message).toBe(
      [
        'The deck did not start: the page failed before the deck could mount.',
        'decks/q3/slides/bye.tsx',
        "  SyntaxError: The requested module 'decks/q3/slides/helper.ts' does not provide an export named 'farewell'",
        'Fix the import in decks/q3/slides/bye.tsx: it imports `farewell` from ' +
          'decks/q3/slides/helper.ts, which does not export it. Import a name that module ' +
          'exports, or export `farewell` from it.',
      ].join('\n'),
    );
  });

  it('points at the file and the tools for any other error', () => {
    const message = startFailureMessage(
      [{ message: 'TypeError: x is not a function', file: '/work/talks/decks/q3/slides/a.tsx' }],
      ROOT,
    );
    expect(message).toContain('Fix the error in decks/q3/slides/a.tsx');
    expect(message).toContain('`pnpm deck dev <deck>`');
  });
});

describe('shownFile', () => {
  it('drops the /@fs prefix and the query, keeps a location, and leaves outside files absolute', () => {
    expect(shownFile('/@fs/work/talks/decks/q3/slides/a.tsx?t=12', ROOT)).toBe(
      'decks/q3/slides/a.tsx',
    );
    expect(shownFile('/work/talks/decks/q3/slides/a.tsx:3:4', ROOT)).toBe(
      'decks/q3/slides/a.tsx:3:4',
    );
    expect(shownFile('/elsewhere/a.ts', ROOT)).toBe('/elsewhere/a.ts');
    expect(shownFile('/@fs/work/talks/a.ts', undefined)).toBe('/work/talks/a.ts');
  });
});
