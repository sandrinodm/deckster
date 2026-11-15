import type { Browser } from '@e2e-dev/web';

import { test as base } from '@e2e-dev/web';
import { expect } from 'e2e';

/**
 * The window property the init script collects the page's problems in.
 */
const PROBLEMS_KEY = '__e2eProblems';

/**
 * The console errors, console warnings and uncaught errors the open pages logged.
 */
export type PageProblems = {
  /**
   * Runs a navigation, first moving what the current document recorded into
   * {@link PageProblems.seen}, because a new document starts with an empty list.
   *
   * @param navigate - Opens a page, such as `() => app.open('/')`.
   */
  navigate: (navigate: () => Promise<void>) => Promise<void>;

  /**
   * Every problem collected so far, in the order the pages logged them.
   */
  readonly seen: readonly string[];
};

/**
 * The browser `test` with a `problems` fixture that fails any test whose pages log a console error
 * or warning (such as a React DOM nesting warning), an uncaught error, an unhandled rejection or an
 * element that fails to load.
 */
export const test = base.extend<{ problems: PageProblems }>({
  problems: async ({ browser }, use) => {
    await browser.addInitScript(recordProblems, PROBLEMS_KEY);
    const seen: string[] = [];
    let opened = false;
    /**
     * Moves what the current document recorded into `seen`; nothing before the first page opens.
     */
    const collect = async (): Promise<void> => {
      if (opened) {
        seen.push(...(await takeProblems(browser)));
      }
    };
    await use({
      navigate: async (navigate) => {
        await collect();
        await navigate();
        opened = true;
      },
      seen,
    });
    await collect();
    expect(seen, 'console errors and warnings').toEqual([]);
  },
});

/**
 * Runs in every document before its own scripts: wraps `console.error` and `console.warn` and
 * listens for uncaught errors, failed element loads and unhandled rejections, pushing a line for
 * each onto `window[key]`. It is serialized into the page, so it uses nothing from this module.
 *
 * @param key - The window property that holds the list.
 */
function recordProblems(key: string): void {
  const problems: string[] = [];
  Reflect.set(window, key, problems);
  for (const level of ['error', 'warn'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      problems.push(args.map(String).join(' '));
      original(...args);
    };
  }

  window.addEventListener(
    'error',
    (event) => {
      const target = event.target;
      if (target instanceof Element) {
        const source = target.getAttribute('src') ?? target.getAttribute('href') ?? '';
        problems.push(`Failed to load <${target.tagName.toLowerCase()}> ${source}`);
        return;
      }

      problems.push(event.message);
    },
    true,
  );
  window.addEventListener('unhandledrejection', (event) => {
    problems.push(`Unhandled rejection: ${String(event.reason)}`);
  });
}

/**
 * Reads and clears what the current document recorded; empty before the first page opens.
 *
 * @param browser - The browser fixture.
 */
function takeProblems(browser: Browser): Promise<string[]> {
  return browser.evaluate((key: string) => {
    const recorded: unknown = Reflect.get(window, key);
    Reflect.set(window, key, []);
    return Array.isArray(recorded) ? recorded.map(String) : [];
  }, PROBLEMS_KEY);
}
