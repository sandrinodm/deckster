import { Effect } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import type { PageClient, PageListener } from '#mcp/page-link.ts';
import type { PageGotoRequest, PageStateReport } from '#protocol/page-link-events.ts';

import { createPageLink } from '#mcp/page-link.ts';
import {
  PAGE_GOTO_DONE_EVENT,
  PAGE_GOTO_EVENT,
  PAGE_STATE_EVENT,
} from '#protocol/page-link-events.ts';

/**
 * A page report with defaults for what a test does not care about.
 *
 * @param page - The page id.
 * @param overrides - Fields to change.
 */
function report(page: string, overrides: Partial<PageStateReport> = {}): PageStateReport {
  return {
    page,
    closed: false,
    focusedAt: 0,
    slide: { id: 'title', index: 0, file: 'slides/title.mdx', layout: 'title', title: 'Hello' },
    step: 0,
    stepCount: 1,
    brand: 'default',
    selection: '',
    ...overrides,
  };
}

/**
 * A channel the test drives by hand, and the pages connected to it.
 */
function harness() {
  const listeners = new Map<string, PageListener>();
  const link = createPageLink();
  link.attach({
    on: (event, listener) => void listeners.set(event, listener),
    off: (event) => void listeners.delete(event),
  });
  const closers: (() => void)[] = [];
  const sent: { page: string; event: string; payload: unknown }[] = [];
  /**
   * Connects a page and returns it.
   *
   * @param page - The page id.
   * @param answer - How the page answers goto requests; none by default.
   */
  const connect = (page: string, answer?: (request: PageGotoRequest) => unknown) => {
    const client: PageClient = {
      send: (event, payload) => {
        sent.push({ page, event, payload });
        if (event === PAGE_GOTO_EVENT && answer !== undefined) {
          queueMicrotask(() =>
            listeners.get(PAGE_GOTO_DONE_EVENT)?.(answer(payload as PageGotoRequest), client),
          );
        }
      },
      socket: { once: (_event, listener) => void closers.push(listener) },
    };
    return {
      report: (state: PageStateReport) => listeners.get(PAGE_STATE_EVENT)?.(state, client),
    };
  };
  return { link, connect, closers, sent, listeners };
}

describe('page link', () => {
  it('has no current page until one reports', async () => {
    const { link } = harness();
    expect(await Effect.runPromise(link.current)).toBeUndefined();
  });

  it('returns the most recently focused page, and counts the pages', async () => {
    const { link, connect } = harness();
    const first = connect('a');
    const second = connect('b');
    first.report(report('a', { focusedAt: 200, step: 1 }));
    second.report(report('b', { focusedAt: 100 }));
    const current = await Effect.runPromise(link.current);
    expect(current).toMatchObject({ page: 'a', step: 1, pages: 2 });
    second.report(
      report('b', {
        focusedAt: 300,
        slide: {
          id: 'steps',
          index: 1,
          file: 'slides/steps.mdx',
          layout: 'default',
          title: 'Steps',
        },
      }),
    );
    expect(await Effect.runPromise(link.current)).toMatchObject({ page: 'b' });
  });

  it('breaks a focus tie with the latest report', async () => {
    const { link, connect } = harness();
    connect('a').report(report('a'));
    connect('b').report(report('b'));
    expect(await Effect.runPromise(link.current)).toMatchObject({ page: 'b' });
  });

  it('forgets a page that says it is closing or whose socket closes', async () => {
    const { link, connect, closers } = harness();
    const a = connect('a');
    a.report(report('a', { focusedAt: 5 }));
    a.report(report('a', { closed: true }));
    expect(await Effect.runPromise(link.current)).toBeUndefined();
    connect('b').report(report('b'));
    closers.forEach((close) => close());
    expect(await Effect.runPromise(link.current)).toBeUndefined();
  });

  it('drops reports that do not match the shape', async () => {
    const { link, listeners, connect } = harness();
    const page = connect('a');
    listeners.get(PAGE_STATE_EVENT)?.(
      { page: 'a' },
      { send: () => undefined, socket: { once: () => undefined } },
    );
    listeners.get(PAGE_STATE_EVENT)?.('nonsense', {
      send: () => undefined,
      socket: { once: () => undefined },
    });
    expect(await Effect.runPromise(link.current)).toBeUndefined();
    page.report(report('a'));
    expect(await Effect.runPromise(link.current)).toMatchObject({ page: 'a' });
  });

  it('sends goto to the focused page and returns its answer', async () => {
    const { link, connect, sent } = harness();
    connect('a', (request) => ({
      request: request.request,
      ok: true,
      error: '',
      slide: request.slide,
      step: request.step,
    })).report(report('a', { focusedAt: 10 }));
    connect('b').report(report('b', { focusedAt: 1 }));
    const done = await Effect.runPromise(link.goto('closing', 2));
    expect(done).toMatchObject({ ok: true, slide: 'closing', step: 2 });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      page: 'a',
      event: PAGE_GOTO_EVENT,
      payload: { slide: 'closing', step: 2 },
    });
  });

  it('fails goto with the page error, and when no page is open', async () => {
    const { link, connect } = harness();
    const none = await Effect.runPromise(Effect.flip(link.goto('x', 0)));
    expect(none.message).toContain('No deck page is open');
    connect('a', (request) => ({
      request: request.request,
      ok: false,
      error: 'No slide with id "x".',
      slide: '',
      step: 0,
    })).report(report('a'));
    const failed = await Effect.runPromise(Effect.flip(link.goto('x', 0)));
    expect(failed.message).toContain('No slide with id "x".');
    expect(failed.message).toContain('deck_outline');
  });
});
