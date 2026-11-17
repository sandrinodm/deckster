import type { Browser, WebApp } from '@e2e-dev/web';

import { describe } from '@e2e-dev/web';
import { expect } from 'e2e';

import type { PageProblems } from './support/page-problems.ts';

import { DECK_PORT, openDeck } from './support/deck.ts';
import { test } from './support/page-problems.ts';

/**
 * A path on the deck's origin the dev server does not serve; the iframe test answers it with a host
 * page.
 */
const HOST_PATH = '/__embed-host';

/**
 * The width of the iframe most tests embed the deck in, in CSS pixels.
 */
const FRAME_WIDTH = 720;

/**
 * The width of a phone-sized iframe, in CSS pixels.
 */
const NARROW_FRAME_WIDTH = 390;

/**
 * The most of a phone-sized frame the control may cover, as a fraction of the frame's area.
 */
const MAX_NARROW_COVER = 0.05;

/**
 * Longer than the control's idle delay (`EMBED_CONTROLS_IDLE_MS`) plus its fade, in milliseconds.
 */
const IDLE_WAIT_MS = 5000;

/**
 * A page that embeds the hello deck's second slide in a 16:9 iframe above a long column, so it can
 * scroll.
 *
 * @param width - The iframe's width in CSS pixels.
 */
function hostPage(width: number): string {
  const height = Math.round((width * 9) / 16);
  const frameStyle = `width:${width}px;height:${height}px;border:0`;
  return [
    '<!doctype html>',
    '<html><head><meta charset="utf-8"><title>Host</title><link rel="icon" href="data:,"></head>',
    '<body style="margin:0">',
    `<iframe src="/?embed#/2/0" title="Deck" style="${frameStyle}"></iframe>`,
    '<div style="height:3000px">Below the deck.</div>',
    '</body></html>',
  ].join('\n');
}

/**
 * Opens a host page with the deck in an iframe of the given width and waits for the control.
 *
 * @param fixtures - The test's `app`, `browser` and `problems` fixtures.
 * @param width - The iframe's width in CSS pixels.
 */
async function openHost(
  fixtures: { app: WebApp; browser: Browser; problems: PageProblems },
  width: number,
): Promise<void> {
  const { browser, app, problems } = fixtures;
  await browser.route(`http://localhost:${DECK_PORT}${HOST_PATH}`, (route) =>
    route.fulfill({ contentType: 'text/html', body: hostPage(width) }),
  );
  await problems.navigate(() => app.open(HOST_PATH));
  await expect(browser.frameLocator('iframe').locator('[data-testid="deck-embed"]')).toContainText(
    'Slide 2 of 4',
  );
}

/**
 * What the control inside the host page's iframe looks like: its share of the frame's area, its
 * opacity and idle flag, and whether the short count and the visible link text are shown.
 *
 * @param browser - The browser fixture, on the host page.
 */
function controlState(browser: Browser) {
  return browser.evaluate(() => {
    const frame = document.querySelector('iframe')!;
    const doc = frame.contentDocument!;
    const control = doc.querySelector<HTMLElement>('.deck-embed-controls')!;
    const box = control.getBoundingClientRect();
    const linkText = doc
      .querySelector('.deck-embed-open .deck-embed-long')!
      .getBoundingClientRect();
    const short = doc.querySelector('.deck-embed-short')!;
    return {
      cover: (box.width * box.height) / (frame.clientWidth * frame.clientHeight),
      opacity: getComputedStyle(control).opacity,
      idle: control.dataset.idle ?? null,
      shortShown: getComputedStyle(short).display !== 'none',
      linkTextShown: linkText.width > 1,
    };
  });
}

/**
 * The URL hash inside the host page's iframe, read through the parent because both share an origin.
 *
 * @param browser - The browser fixture, on the host page.
 */
function frameHash(browser: Browser): Promise<string> {
  return browser.evaluate(() => document.querySelector('iframe')!.contentWindow!.location.hash);
}

describe('embed mode', () => {
  test('shows the slide with a small control and none of the presenter tools', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, '/?embed#/2/0');
    const historyLength = await browser.evaluate(() => window.history.length);
    const embed = browser.locator('[data-testid="deck-embed"]');
    await expect(embed).toContainText('Slide 2 of 4');
    expect(await browser.evaluate(() => document.querySelector('.dp-ui') === null)).toBe(true);
    // The dev server loads the presenter and comment plugins; neither may add anything here.
    const viewportChildren = await browser.evaluate(() =>
      [...document.querySelector('.deck-viewport')!.children].map((child) => child.className),
    );
    expect(viewportChildren).toEqual(['deck-main', 'deck-embed-layer']);

    // A pointer move brings the control back if it has faded out by now.
    await browser.mouse.move(640, 360);
    await browser.locator('[data-testid="deck-embed"] button[aria-label="Next"]').click();
    await expect(browser).toHaveURL(/#\/2\/1$/);
    const link = browser.locator('.deck-embed-open');
    await expect(link).toHaveAttribute('href', '/#/2/1');
    await expect(link).toHaveAttribute('target', '_blank');

    await browser.keyboard.press('ArrowRight');
    await expect(browser).toHaveURL(/#\/2\/2$/);
    expect(await browser.evaluate(() => window.history.length)).toBe(historyLength);
  });

  test('leaves focus, keys and history to the page around an iframe', async (fixtures) => {
    const { browser } = fixtures;
    await openHost(fixtures, FRAME_WIDTH);
    const frame = browser.frameLocator('iframe');
    const historyLength = await browser.evaluate(() => window.history.length);
    expect(await browser.evaluate(() => document.activeElement?.tagName ?? null)).toBe('BODY');

    await browser.keyboard.press('ArrowDown');
    await expect.poll(() => browser.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    expect(await frameHash(browser)).toBe('#/2/0');

    // A pointer move over the frame brings the control back if it has faded out by now.
    await browser.mouse.move(FRAME_WIDTH / 2, 40);
    await frame.locator('button[aria-label="Next"]').click();
    await expect.poll(() => frameHash(browser)).toBe('#/2/1');
    expect(await browser.evaluate(() => window.history.length)).toBe(historyLength);
  });

  test('shortens to icons and n/N in a narrow frame, keeping the names', async (fixtures) => {
    await openHost(fixtures, FRAME_WIDTH);
    const wide = await controlState(fixtures.browser);
    expect(wide.linkTextShown).toBe(true);
    expect(wide.shortShown).toBe(false);

    await openHost(fixtures, NARROW_FRAME_WIDTH);
    const narrow = await controlState(fixtures.browser);
    expect(narrow.linkTextShown).toBe(false);
    expect(narrow.shortShown).toBe(true);
    expect(narrow.cover).toBeLessThan(MAX_NARROW_COVER);
    const frame = fixtures.browser.frameLocator('iframe');
    await expect(frame.locator('.deck-embed-open')).toHaveAccessibleName('Open full deck');
  });

  test('fades out when idle and returns on a pointer move or keyboard focus', async (fixtures) => {
    const { browser } = fixtures;
    await openHost(fixtures, FRAME_WIDTH);
    await expect
      .poll(async () => (await controlState(browser)).opacity, { timeout: IDLE_WAIT_MS })
      .toBe('0');

    await browser.mouse.move(100, 100);
    await browser.mouse.move(120, 110);
    await expect.poll(async () => (await controlState(browser)).idle).toBe('false');

    await browser.keyboard.press('Tab');
    await expect
      .poll(async () => (await controlState(browser)).idle, { timeout: IDLE_WAIT_MS })
      .toBe('true');
    expect((await controlState(browser)).opacity).toBe('1');
  });

  test('keeps keyboard focus on Previous when it reaches the first slide', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, '/?embed#/2/0');
    const previous = browser.locator('[data-testid="deck-embed"] button[aria-label="Previous"]');
    await browser.keyboard.press('Tab');
    await expect(previous).toBeFocused();

    await browser.keyboard.press('Enter');
    await expect(browser).toHaveURL(/#\/1\/0$/);
    await expect(previous).toHaveAttribute('aria-disabled', 'true');
    await expect(previous).toBeFocused();
    await expect
      .poll(() =>
        browser.evaluate(
          () => getComputedStyle(document.querySelector('.deck-embed-controls')!).opacity,
        ),
      )
      .toBe('1');
  });

  test('fades without a transition when the reader asks for reduced motion', async (fixtures) => {
    const { browser } = fixtures;
    await browser.emulateMedia({ reducedMotion: 'reduce' });
    await openHost(fixtures, FRAME_WIDTH);
    const duration = await browser.evaluate(() => {
      const doc = document.querySelector('iframe')!.contentDocument!;
      return getComputedStyle(doc.querySelector('.deck-embed-controls')!).transitionDuration;
    });
    expect(duration).toBe('0s');
  });
});
