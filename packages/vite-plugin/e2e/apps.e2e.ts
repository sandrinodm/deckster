import type { Browser } from '@e2e-dev/web';

import { describe } from '@e2e-dev/web';
import { expect } from 'e2e';
import fs from 'node:fs';
import path from 'node:path';

import { APPS_DECK, APPS_URLS, useAppsServers, WORKSPACE_ROOT } from './support/apps-servers.ts';
import { test } from './support/page-problems.ts';
import { openDeck } from './support/presenter-deck.ts';

/**
 * The one-based slide numbers of the apps-demo deck.
 */
const SLIDE = {
  /**
   * The inline widget.
   */
  counter: 2,

  /**
   * The agent mini app.
   */
  agent: 3,

  /**
   * The external page.
   */
  external: 4,
} as const;

useAppsServers();

/**
 * Reads something from the agent app's document, which the deck serves from its own origin.
 *
 * @param browser - The browser fixture.
 * @param read - Source of a function body that gets the frame's `document`, as text.
 */
function inApp(browser: Browser, read: string): Promise<string> {
  const source = [
    '() => {',
    '  const frame = document.querySelector("iframe.kit-app-iframe");',
    '  const doc = frame instanceof HTMLIFrameElement ? frame.contentDocument : null;',
    '  if (doc === null) { return ""; }',
    `  return String(((document) => (${read}))(doc) ?? "");`,
    '}',
  ].join('\n');
  return browser.evaluate<string>(source);
}

/**
 * Whether the "Return to deck" control of the slide on screen is there and drawn where it can be
 * seen and clicked: `visible` when the element at its center is the control, `hidden` when
 * something covers or clips it, `none` when it is not there.
 *
 * @param browser - The browser fixture.
 */
function releaseControl(browser: Browser): Promise<'visible' | 'hidden' | 'none'> {
  return browser.evaluate(() => {
    const control = document.querySelector('[data-slide-active="true"] .kit-app-release');
    if (control === null) {
      return 'none';
    }

    const box = control.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return hit !== null && control.contains(hit) ? 'visible' : 'hidden';
  });
}

/**
 * Opens the agent slide and waits until the app has told the deck it is ready.
 *
 * @param fixtures - The test's fixtures.
 * @param url - The deck's base URL.
 * @param step - The step to open at.
 */
async function openAgent(
  fixtures: Parameters<typeof openDeck>[0],
  url: string,
  step = 0,
): Promise<void> {
  await openDeck(fixtures, `${url}#/${SLIDE.agent}/${step}`);
  await expect
    .poll(() => inApp(fixtures.browser, "document.documentElement.dataset['deckBrand']"))
    .not.toBe('');
  await fixtures.browser.evaluate(() => window.__deck?.ready().then(() => null) ?? null);
}

describe('the agent mini app', () => {
  test('receives the brand tokens, its fonts and re-themes under nocturne', async (fixtures) => {
    const { browser } = fixtures;
    const seen: Record<string, string[]> = {};
    for (const brand of ['default', 'nocturne'] as const) {
      await openAgent(fixtures, APPS_URLS[brand]);
      const accent = await inApp(
        browser,
        "document.documentElement.style.getPropertyValue('--brand-color-accent')",
      );
      const hostAccent = await browser.evaluate(() => {
        const slide = document.querySelector('[data-slide-active="true"]');
        return slide === null
          ? ''
          : getComputedStyle(slide).getPropertyValue('--brand-color-accent').trim();
      });
      expect(accent, `${brand} accent in the app`).toBe(hostAccent);
      const background = await inApp(
        browser,
        "getComputedStyle(document.querySelector('.ag')).backgroundColor",
      );
      const displayFace = await inApp(
        browser,
        "[...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family).join('|')",
      );
      seen[brand] = [
        accent,
        background,
        displayFace,
        await inApp(browser, "document.documentElement.dataset['deckBrand']"),
        await inApp(browser, "document.documentElement.dataset['deckScheme']"),
      ];
    }

    expect(seen['default']?.[3]).toBe('default');
    expect(seen['nocturne']?.[3]).toBe('nocturne');
    expect(seen['default']?.[1]).toBe('rgb(252, 252, 253)');
    expect(seen['nocturne']?.[1]).not.toBe(seen['default']?.[1]);
    expect(seen['nocturne']?.[0]).not.toBe(seen['default']?.[0]);
    expect(seen['default']?.[2]).toContain('Bricolage');
    expect(seen['nocturne']?.[2]).toContain('Fraunces');
  });

  test('speaks the bridge protocol and owns the steps it asks for', async (fixtures) => {
    const { browser } = fixtures;
    await browser.addInitScript(() => {
      const log: string[] = [];
      Reflect.set(window, '__bridgeLog', log);
      window.addEventListener('message', (event) => {
        const data: unknown = event.data;
        if (typeof data === 'object' && data !== null && 'type' in data) {
          log.push(JSON.stringify(data));
        }
      });
    });
    await openAgent(fixtures, APPS_URLS.default);
    const log = await browser.evaluate(() => Reflect.get(window, '__bridgeLog') as string[]);
    const types = log.map((line) => (JSON.parse(line) as { type: string }).type);
    expect(types).toContain('hello');
    expect(types).toContain('requestSteps');
    expect(types).toContain('ready');
    expect(log.find((line) => line.includes('"requestSteps"'))).toContain('"count":3');
    const stepCount = await browser.evaluate(() => window.__deck?.slides[2]?.stepCount ?? 0);
    expect(stepCount).toBe(4);
  });

  test('plays one move of the run for each step of the slide', async (fixtures) => {
    const { browser } = fixtures;
    await openAgent(fixtures, APPS_URLS.default);
    /**
     * How many elements of the app match a selector, as text.
     */
    const count = (selector: string): Promise<string> =>
      inApp(browser, `document.querySelectorAll('${selector}').length`);
    expect(await count('.ag-tool')).toBe('0');
    expect(await inApp(browser, "document.querySelector('.ag-user')?.textContent")).toContain(
      'Checkout got slow',
    );
    await browser.keyboard.press('ArrowRight');
    await expect.poll(() => count('.ag-tool[data-state="done"]')).toBe('1');
    await browser.keyboard.press('ArrowRight');
    await expect.poll(() => count('.ag-tool[data-state="done"]')).toBe('2');
    await browser.keyboard.press('ArrowRight');
    await expect
      .poll(() => inApp(browser, "document.querySelector('.ag-answer')?.textContent ?? ''"))
      .toContain('would start there');
    await expect(browser).toHaveURL(/#\/3\/3$/);
    await browser.keyboard.press('ArrowLeft');
    await expect(browser).toHaveURL(/#\/3\/2$/);
    await expect.poll(() => count('.ag-answer')).toBe('0');
  });

  test('keeps the keyboard while focused and gives it back on Escape', async (fixtures) => {
    const { browser } = fixtures;
    await openAgent(fixtures, APPS_URLS.default);
    await browser.frameLocator('iframe.kit-app-iframe').locator('.ag-replay').click();
    await expect.poll(() => releaseControl(browser)).toBe('visible');
    await browser.keyboard.press('ArrowRight');
    await browser.keyboard.press('Space');
    await expect(browser).toHaveURL(/#\/3\/0$/);
    await browser.keyboard.press('Escape');
    await expect.poll(() => releaseControl(browser)).toBe('none');
    await browser.keyboard.press('ArrowRight');
    await expect(browser).toHaveURL(/#\/3\/1$/);
  });

  test('pauses when the slide leaves and runs again on return', async (fixtures) => {
    const { browser } = fixtures;
    await openAgent(fixtures, APPS_URLS.default);
    /**
     * The agent's `data-paused` flag, as text.
     */
    const paused = (): Promise<string> =>
      inApp(browser, "document.querySelector('.ag')?.dataset['paused']");
    expect(await paused()).toBe('false');
    await browser.evaluate(() => {
      window.__deck?.goto(1);
      return null;
    });
    await expect.poll(paused).toBe('true');
    await browser.evaluate(() => {
      window.__deck?.goto(2);
      return null;
    });
    await expect.poll(paused).toBe('false');
  });
});

describe('the inline live widget', () => {
  test('keeps the arrow keys while focused, and Escape returns them to the deck', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${APPS_URLS.default}#/${SLIDE.counter}/0`);
    /**
     * The counter's number, as text.
     */
    const value = (): Promise<string> =>
      browser.evaluate(() => document.querySelector('.counter-value')?.textContent ?? '');
    expect(await value()).toBe('3');
    await browser.locator('.counter-controls button:last-child').click();
    expect(await value()).toBe('4');
    await browser.keyboard.press('ArrowUp');
    expect(await value()).toBe('5');
    await browser.keyboard.press('ArrowRight');
    await expect(browser).toHaveURL(/#\/2\/0$/);
    expect(
      await browser.evaluate(
        () => document.querySelector('.kit-live .kit-app-hint')?.getAttribute('data-visible') ?? '',
      ),
    ).toBe('true');
    await browser.keyboard.press('Escape');
    await browser.keyboard.press('ArrowRight');
    await expect(browser).toHaveURL(/#\/3\/0$/);
  });

  test('takes the arrow keys after a click anywhere on it, as its hint says', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${APPS_URLS.default}#/${SLIDE.counter}/0`);
    /**
     * The counter's number, as text.
     */
    const value = (): Promise<string> =>
      browser.evaluate(() => document.querySelector('.counter-value')?.textContent ?? '');
    await browser.locator('.counter-label').click();
    await browser.keyboard.press('ArrowUp');
    expect(await value()).toBe('4');
    await browser.keyboard.press('ArrowLeft');
    expect(await value()).toBe('3');
    await expect(browser).toHaveURL(/#\/2\/0$/);
  });

  test('a click inside does not move the deck', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${APPS_URLS.default}#/${SLIDE.counter}/0`);
    await browser.locator('.counter-value').click();
    await expect(browser).toHaveURL(/#\/2\/0$/);
  });
});

describe('static mode', () => {
  test('shows posters, never an iframe, and the run at every step', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${APPS_URLS.default}?static#/${SLIDE.agent}/0`);
    await browser.evaluate(() => window.__deck?.ready().then(() => null) ?? null);
    expect(await browser.evaluate(() => document.querySelectorAll('iframe').length)).toBe(0);
    expect(await browser.evaluate(() => document.querySelectorAll('.kit-app-poster').length)).toBe(
      3,
    );
    expect(
      await browser.evaluate(() => document.querySelectorAll('[data-app-missing-poster]').length),
    ).toBe(0);
    const steps = await browser.evaluate(
      () => window.__deck?.slides.map((s) => s.stepCount ?? 0) ?? [],
    );
    expect(steps).toEqual([1, 1, 4, 1]);
    const poster = await browser.evaluate(() => {
      const image = document.querySelector<HTMLImageElement>('.kit-app-poster-image');
      return image === null ? 0 : image.naturalWidth;
    });
    expect(poster).toBeGreaterThan(0);
    expect(await browser.evaluate(() => document.querySelectorAll('.kit-live iframe').length)).toBe(
      0,
    );
  });
});

describe('an app the deck does not have', () => {
  test('is a 404 in dev and in preview, never the deck page', async () => {
    for (const base of [APPS_URLS.default, APPS_URLS.built]) {
      const page = await fetch(`${base}apps/not-an-app/`);
      expect(page.status, base).toBe(404);
      const text = await page.text();
      expect(text, base).toContain('pnpm deck new app apps-demo not-an-app');
      expect(text, base).toContain('Apps: agent-demo.');
      expect(text, base).not.toContain('deck-root');
    }
  });
});

describe('the production build', () => {
  test('gives the app the brand fonts, resolved next to the deck', async (fixtures) => {
    const { browser } = fixtures;
    await openAgent(fixtures, APPS_URLS.built);
    await expect
      .poll(() =>
        inApp(
          browser,
          "[...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family).join('|')",
        ),
      )
      .toContain('Bricolage');
    const faces = await inApp(
      browser,
      "[...document.styleSheets].flatMap((s) => [...s.cssRules]).map((r) => r.cssText).filter((t) => t.startsWith('@font-face')).join(' ')",
    );
    expect(faces).toContain(`url("${APPS_URLS.built}assets/`);
  });

  test('writes the app next to the deck and serves it at apps/<name>/', async (fixtures) => {
    const { browser } = fixtures;
    const dist = path.join(WORKSPACE_ROOT, 'decks', APPS_DECK, 'dist');
    expect(fs.existsSync(path.join(dist, 'apps', 'agent-demo', 'index.html'))).toBe(true);
    const page = await fetch(`${APPS_URLS.built}apps/agent-demo/`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<div id="root">');
    await openAgent(fixtures, APPS_URLS.built);
    expect(await inApp(browser, "document.querySelector('.ag-user')?.textContent")).toContain(
      'Checkout got slow',
    );
  });
});
