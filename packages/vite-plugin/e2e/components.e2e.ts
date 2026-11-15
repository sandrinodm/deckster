import type { Browser } from '@e2e-dev/web';

import { describe } from '@e2e-dev/web';
import { expect } from 'e2e';

import type { PageProblems } from './support/page-problems.ts';

import { COMPONENTS_URL, useComponentsServer } from './support/components-server.ts';
import { test } from './support/page-problems.ts';

/**
 * The part of `window.__deck` these tests use.
 */
type DeckWindow = Window & {
  /**
   * The deck's automation API, once the deck has mounted.
   */
  __deck?: {
    /**
     * Resolves once the slide on screen (or every slide, in static mode) is ready to capture.
     */
    ready: () => Promise<void>;
  };
};

/**
 * The one-based slide numbers of the components deck, in its manifest order.
 */
const SLIDE = {
  /**
   * A fence with highlight steps and a marked word.
   */
  middleware: 1,

  /**
   * A video cut into three parts by cues.
   */
  video: 2,

  /**
   * A diff on the gradient surface.
   */
  userOr401: 3,

  /**
   * A Magic Move between three states.
   */
  handler: 4,

  /**
   * A typed terminal session.
   */
  deploy: 5,

  /**
   * A split slide with icons, an image and a markdown link in its caption.
   */
  register: 6,

  /**
   * A code block written in TSX.
   */
  tsx: 7,
} as const;

/**
 * Files that only a browser-side highlighter loads: the lazy chunk, Shiki's packages and its
 * regular-expression engine.
 */
const HIGHLIGHTER_FILE = /runtime-highlighter|@shikijs|deps\/shiki|oniguruma|onig\.wasm/i;

/**
 * Room for every module a dev server sends, which is more than the browser's default of 250
 * resource timing entries.
 */
const MAX_RESOURCES = 5000;

useComponentsServer();

/**
 * Opens a slide of the components deck at a step and waits until it is ready.
 *
 * @param fixtures - The test's `browser` and `problems` fixtures.
 * @param slide - The one-based slide number.
 * @param step - The deck step.
 * @param query - A query string such as `?static`, with its question mark.
 */
async function open(
  fixtures: { browser: Browser; problems: PageProblems },
  slide: number,
  step: number,
  query = '',
): Promise<void> {
  const { browser, problems } = fixtures;
  await problems.navigate(() => browser.goto(`${COMPONENTS_URL}${query}#/${slide}/${step}`));
  await expect
    .poll(() => browser.evaluate(() => (window as DeckWindow).__deck !== undefined))
    .toBe(true);
  await browser.evaluate(() => (window as DeckWindow).__deck!.ready().then(() => null));
}

/**
 * Moves the open deck to a slide and step by changing the URL hash, which the deck follows without
 * reloading the page.
 *
 * @param browser - The browser fixture.
 * @param slide - The one-based slide number.
 * @param step - The deck step.
 */
async function goTo(browser: Browser, slide: number, step: number): Promise<void> {
  await browser.evaluate((hash: `#/${number}/${number}`) => {
    location.hash = hash;
    return null;
  }, `#/${slide}/${step}`);
  await browser.evaluate(() => (window as DeckWindow).__deck!.ready().then(() => null));
}

/**
 * The line numbers in focus in the code block of the slide on screen.
 *
 * @param browser - The browser fixture.
 */
function focusedLines(browser: Browser): Promise<number[]> {
  return browser.evaluate(() =>
    [
      ...document.querySelectorAll('[data-slide-active="true"] .kit-code-line[data-focus="on"]'),
    ].map((line) => Number(line.getAttribute('data-line'))),
  );
}

/**
 * The text of the code or terminal on the slide on screen.
 *
 * @param browser - The browser fixture.
 * @param selector - Selects the block inside the slide.
 */
function blockText(browser: Browser, selector: string): Promise<string> {
  return browser.evaluate(
    (css: string) =>
      document.querySelector<HTMLElement>(`[data-slide-active="true"] ${css}`)?.textContent ?? '',
    selector,
  );
}

describe('code blocks', () => {
  test('highlight different lines at each step and fade the rest back', async (fixtures) => {
    const { browser } = fixtures;
    await open(fixtures, SLIDE.middleware, 0);
    expect(await focusedLines(browser)).toEqual([]);

    await goTo(browser, SLIDE.middleware, 1);
    await expect.poll(() => focusedLines(browser)).toEqual([3, 4, 5]);
    expect(
      await browser.evaluate(
        () =>
          document.querySelectorAll('[data-slide-active="true"] .kit-code-line[data-focus="off"]')
            .length,
      ),
    ).toBe(5);

    await goTo(browser, SLIDE.middleware, 2);
    await expect.poll(() => focusedLines(browser)).toEqual([4]);

    await goTo(browser, SLIDE.middleware, 3);
    await expect.poll(() => focusedLines(browser)).toEqual([7]);
  });

  test('are highlighted at build time, so no highlighter loads in the browser', async (fixtures) => {
    const { browser } = fixtures;
    await browser.addInitScript(
      (size: number) => performance.setResourceTimingBufferSize(size),
      MAX_RESOURCES,
    );
    await open(fixtures, SLIDE.middleware, 0);
    const requested = await browser.evaluate(
      (pattern: string) =>
        performance
          .getEntriesByType('resource')
          .map((entry) => entry.name)
          .filter((name) => new RegExp(pattern, 'i').test(name)),
      HIGHLIGHTER_FILE.source,
    );
    expect(requested).toEqual([]);
    expect(await blockText(browser, '.kit-code-area')).toContain('app.use(authenticate());');
  });

  test('mark added and removed lines and the changed word', async (fixtures) => {
    const { browser } = fixtures;
    await open(fixtures, SLIDE.userOr401, 0);
    const changes = await browser.evaluate(() =>
      [...document.querySelectorAll('[data-slide-active="true"] .kit-code-line[data-change]')].map(
        (line) => line.getAttribute('data-change'),
      ),
    );
    expect(changes).toEqual(['remove', 'add']);
    expect(await blockText(browser, '[data-mark]')).toBe('requireUser');
  });
});

describe('a code move', () => {
  test('shows the first state on arrival and the final state at the last step', async (fixtures) => {
    const { browser } = fixtures;
    await open(fixtures, SLIDE.handler, 0);
    await expect.poll(() => blockText(browser, '.kit-code-move')).toContain('res.json(rows)');

    await goTo(browser, SLIDE.handler, 2);
    await expect.poll(() => blockText(browser, '.kit-code-move')).toContain('requireUser(req)');
  });

  test('ends on the final state in static mode, with no animation', async (fixtures) => {
    const { browser } = fixtures;
    await open(fixtures, SLIDE.handler, 2, '?static');
    const text = await blockText(browser, '.kit-code-move');
    expect(text).toContain('export async function listOrders(req: Request)');
    expect(text).not.toContain('res.json');
    expect(
      await browser.evaluate(
        () =>
          document.querySelectorAll(
            '[data-slide-active="true"] .shiki-magic-move-enter-active, [data-slide-active="true"] .shiki-magic-move-leave-active',
          ).length,
      ),
    ).toBe(0);
  });

  test('shows the state of each step when a step is opened directly', async (fixtures) => {
    const { browser } = fixtures;
    await open(fixtures, SLIDE.handler, 1, '?static');
    const text = await blockText(browser, '.kit-code-move');
    expect(text).toContain('await db.orders');
    expect(text).toContain('res.json(rows)');
    expect(text).not.toContain('requireUser');
  });
});

describe('a terminal', () => {
  test('shows the whole session in static mode at the last step', async (fixtures) => {
    const { browser } = fixtures;
    await open(fixtures, SLIDE.deploy, 3, '?static');
    const text = await blockText(browser, '.kit-terminal-body');
    expect(text).toContain('pnpm test');
    expect(text).toContain('pnpm deploy --env production');
    expect(text).toContain('live at https://api.larkfield.example/v1?ready=1 in 41 s');
    expect(
      await browser.evaluate(
        () => document.querySelectorAll('[data-slide-active="true"] .kit-terminal a').length,
      ),
    ).toBe(0);
  });

  test('starts empty and types each command at its step', async (fixtures) => {
    const { browser } = fixtures;
    await open(fixtures, SLIDE.deploy, 0);
    /**
     * How many lines of the terminal are not hidden.
     */
    const visibleLines = (): Promise<number> =>
      browser.evaluate(
        () =>
          document.querySelectorAll(
            '[data-slide-active="true"] .kit-terminal-line:not([data-state="hidden"])',
          ).length,
      );
    expect(await visibleLines()).toBe(1);

    await goTo(browser, SLIDE.deploy, 1);
    await expect.poll(visibleLines).toBe(2);
    expect(
      await browser.evaluate(
        () =>
          document.querySelector(
            '[data-slide-active="true"] .kit-terminal-line[data-state="shown"]',
          )?.textContent ?? null,
      ),
    ).toContain('pnpm test');
  });
});

describe('a markdown link', () => {
  test('opens outside sites in a new tab, takes the click from the deck and the brand link style', async (fixtures) => {
    const { browser } = fixtures;
    await open(fixtures, SLIDE.register, 0);
    const link = await browser.evaluate(() => {
      const anchor = document.querySelector<HTMLAnchorElement>(
        '[data-slide-active="true"] a.kit-link',
      );
      return anchor === null
        ? null
        : {
            target: anchor.target,
            rel: anchor.rel,
            interactive: anchor.hasAttribute('data-deck-interactive'),
            underline: getComputedStyle(anchor).textDecorationLine,
          };
    });
    expect(link).toEqual({
      target: '_blank',
      rel: 'noopener noreferrer',
      interactive: true,
      underline: 'underline',
    });
  });
});

describe('a code move arriving on a later step', () => {
  test('shows that state at once, with no tokens moving during the entrance', async (fixtures) => {
    const { browser } = fixtures;
    await open(fixtures, SLIDE.userOr401, 0);
    await goTo(browser, SLIDE.handler, 2);
    const moving = await browser.evaluate(
      () =>
        document.querySelectorAll(
          '[data-slide-active="true"] :is(.shiki-magic-move-move, .shiki-magic-move-enter-active, .shiki-magic-move-leave-active)',
        ).length,
    );
    expect(moving).toBe(0);
    expect(await blockText(browser, '.kit-code-move')).toContain('requireUser(req)');
    expect(await blockText(browser, '.kit-code-lang')).toBe('TypeScript');
  });
});

describe('a code block written in TSX', () => {
  test('is highlighted in the browser, and the slide is ready only once it is', async (fixtures) => {
    const { browser } = fixtures;
    await browser.addInitScript(
      (size: number) => performance.setResourceTimingBufferSize(size),
      MAX_RESOURCES,
    );
    await open(fixtures, SLIDE.tsx, 0);
    const lines = await browser.evaluate(
      () => document.querySelectorAll('[data-slide-active="true"] .kit-code-line').length,
    );
    expect(lines).toBe(5);
    const colored = await browser.evaluate(
      () =>
        document.querySelectorAll('[data-slide-active="true"] .kit-code-line [data-t="keyword"]')
          .length,
    );
    expect(colored).toBeGreaterThan(0);
    const requested = await browser.evaluate(
      (pattern: string) =>
        performance
          .getEntriesByType('resource')
          .some((entry) => new RegExp(pattern, 'i').test(entry.name)),
      HIGHLIGHTER_FILE.source,
    );
    expect(requested).toBe(true);
  });
});

describe('a video', () => {
  /**
   * The state of the video on the slide that is on screen.
   *
   * @param browser - The browser fixture.
   */
  function videoState(browser: Browser): Promise<{ paused: boolean; time: number } | null> {
    return browser.evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>(
        '[data-slide-active="true"] video.kit-video-media',
      );
      return video === null ? null : { paused: video.paused, time: video.currentTime };
    });
  }

  test('plays when its slide is on screen, pauses on leaving and holds at its cue', async (fixtures) => {
    const { browser } = fixtures;
    await open(fixtures, SLIDE.video, 0);
    await expect.poll(async () => (await videoState(browser))?.time ?? 0).toBeGreaterThan(0.3);

    await goTo(browser, SLIDE.userOr401, 0);
    const paused = await browser.evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>('video.kit-video-media');
      return video?.paused ?? null;
    });
    expect(paused).toBe(true);

    await goTo(browser, SLIDE.video, 0);
    await expect.poll(async () => (await videoState(browser))?.paused).toBe(false);
    await expect
      .poll(async () => (await videoState(browser))?.paused, { timeout: 8000 })
      .toBe(true);
    const held = (await videoState(browser))?.time ?? 0;
    expect(held).toBeGreaterThanOrEqual(2.9);
    expect(held).toBeLessThan(3.6);
  });

  test('plays the next part at the next step', async (fixtures) => {
    const { browser } = fixtures;
    await open(fixtures, SLIDE.video, 1);
    await expect.poll(async () => (await videoState(browser))?.time ?? 0).toBeGreaterThan(3.2);
  });

  test('plays a part again from its start when the deck steps back, and from 0 on return', async (fixtures) => {
    const { browser } = fixtures;
    await open(fixtures, SLIDE.video, 1);
    await expect.poll(async () => (await videoState(browser))?.time ?? 0).toBeGreaterThan(4);
    await goTo(browser, SLIDE.video, 0);
    await expect.poll(async () => (await videoState(browser))?.time ?? 9).toBeLessThan(2.5);
    await expect
      .poll(async () => (await videoState(browser))?.paused, { timeout: 8000 })
      .toBe(true);
    await goTo(browser, SLIDE.userOr401, 0);
    await goTo(browser, SLIDE.video, 0);
    await expect.poll(async () => (await videoState(browser))?.time ?? 9).toBeLessThan(2);
  });

  test('shows the still of each part in static mode', async (fixtures) => {
    const { browser } = fixtures;
    /**
     * The poster the slide shows in static mode, by its file name.
     */
    const still = (): Promise<string> =>
      browser.evaluate(
        () =>
          document
            .querySelector<HTMLImageElement>('[data-slide-active="true"] img.kit-video-media')
            ?.src.split('/')
            .at(-1) ?? '',
      );
    await open(fixtures, SLIDE.video, 0, '?static');
    expect(await still()).toMatch(/^aurora-part-1/);
    await open(fixtures, SLIDE.video, 2, '?static');
    expect(await still()).toMatch(/^aurora-part-3/);
  });

  test('shows only the poster in static mode', async (fixtures) => {
    const { browser } = fixtures;
    await open(fixtures, SLIDE.video, 0, '?static');
    const media = await browser.evaluate(() => ({
      videos: document.querySelectorAll('[data-slide-active="true"] video').length,
      posters: document.querySelectorAll('[data-slide-active="true"] img.kit-video-media').length,
    }));
    expect(media).toEqual({ videos: 0, posters: 1 });
  });
});
