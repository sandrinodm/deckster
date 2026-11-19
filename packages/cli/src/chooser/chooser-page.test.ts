import { Effect } from 'effect';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vite-plus/test';

import { renderChooser } from '#chooser/chooser-page.ts';
import { makeChooserSelection } from '#chooser/chooser-selection.ts';

/**
 * Finds the standalone client emitted into a chooser document.
 */
const CLIENT_SCRIPT = /<script nonce="test">([\s\S]*?)<\/script>/;

describe('chooser close control', () => {
  it.each([
    { next: 'first', remaining: undefined },
    { next: 'second', remaining: 'second' },
  ])('closes only the deck shown by the tab when $next is active', async ({ next, remaining }) => {
    const selection = await Effect.runPromise(
      makeChooserSelection(
        (name) => Effect.succeed({ url: `http://127.0.0.1/${name}` }),
        () => 5173,
      ),
    );
    try {
      await Effect.runPromise(
        selection.change({ name: 'first', expected: undefined, confirmation: undefined }),
      );
      const html = renderChooser({
        base: '/__deck/chooser/',
        decks: [],
        active: selection.current()?.name,
        selection: selection.current()?.key,
        operator: true,
        returning: undefined,
        desktop: false,
        nonce: 'test',
      });
      await Effect.runPromise(
        selection.change({ name: next, expected: undefined, confirmation: undefined }),
      );

      /**
       * Holds the browser client's registered close-button handler.
       */
      let close = () => {};

      /**
       * Wakes the test after the simulated request has changed the selection.
       */
      let complete = () => {};
      const completed = new Promise<void>((resolve) => {
        complete = resolve;
      });
      const status = { textContent: '', dataset: {} };
      runInNewContext(CLIENT_SCRIPT.exec(html)?.[1] ?? '', {
        URL,
        document: {
          querySelector: (query: string) => {
            if (query === '.status') {
              return status;
            }

            if (query === '[data-close]') {
              return {
                addEventListener: (_event: string, listener: () => void) => (close = listener),
              };
            }

            return { hidden: false };
          },
          querySelectorAll: () => [],
        },
        window: {
          location: { origin: 'http://127.0.0.1:5173', reload: () => complete() },
          addEventListener: () => {},
        },
        IntersectionObserver: class {},
        fetch: async (route: URL) => {
          const result = await Effect.runPromise(
            selection.change({
              name: undefined,
              expected: route.searchParams.get('selection') ?? undefined,
              confirmation: undefined,
            }),
          );
          complete();
          return { ok: result.kind === 'closed', text: async () => result.kind };
        },
      });
      close();
      await completed;
      expect(selection.current()?.name).toBe(remaining);
    } finally {
      await Effect.runPromise(selection.close);
    }
  });
});
