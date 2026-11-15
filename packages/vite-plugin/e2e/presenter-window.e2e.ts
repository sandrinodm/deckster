import { describe } from '@e2e-dev/web';
import { expect } from 'e2e';

import { useBrandServers } from './support/brand-servers.ts';
import { brandUrl } from './support/brands.ts';
import { test } from './support/page-problems.ts';
import {
  clickInPresenter,
  closePresenter,
  openDeck,
  pressInPresenter,
  pressOnInPresenter,
  presenterHas,
  presenterText,
} from './support/presenter-deck.ts';

useBrandServers();

describe('the presenter window', () => {
  test('opens with p, shows the slide, notes, timer and pacing, and stays in step both ways', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${brandUrl('default')}#/2/0`);
    await browser.keyboard.press('p');
    await expect
      .poll(() => presenterText(browser, '[data-testid="slide-count"]'))
      .toContain('Slide 2 of 4');
    expect(await presenterText(browser, '[data-testid="notes"]')).toContain(
      'Press the right arrow three times',
    );
    expect(await presenterText(browser, '[data-testid="pacing"]')).toBeTruthy();

    await browser.keyboard.press('ArrowRight');
    await expect(browser).toHaveURL(/#\/2\/1$/);
    await expect
      .poll(() => presenterText(browser, '[data-testid="slide-count"]'))
      .toContain('step 1 of 3');

    await pressInPresenter(browser, 'ArrowRight');
    await expect(browser).toHaveURL(/#\/2\/2$/);
    await pressInPresenter(browser, 'ArrowLeft');
    await pressInPresenter(browser, 'ArrowLeft');
    await pressInPresenter(browser, 'ArrowLeft');
    await expect(browser).toHaveURL(/#\/1\/0$/);
    await expect
      .poll(() => presenterText(browser, '[data-testid="slide-count"]'))
      .toContain('Slide 1 of 4');
    await closePresenter(browser);
  });

  test('previews the next step while the slide has more, then the next slide', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${brandUrl('default')}#/2/2`);
    await browser.keyboard.press('p');
    await expect
      .poll(() => presenterText(browser, '[data-testid="slide-count"]'))
      .toContain('step 2 of 3');
    await expect.poll(() => presenterText(browser, '[data-testid="next-slide"]')).not.toBeNull();
    await browser.keyboard.press('ArrowRight');
    await browser.keyboard.press('ArrowRight');
    await expect
      .poll(() => presenterText(browser, '[data-testid="slide-count"]'))
      .toContain('Slide 3 of 4');
    await closePresenter(browser);
  });

  test('counts on its timer with start, pause and reset', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${brandUrl('default')}#/1/0`);
    await browser.evaluate(() => {
      window.localStorage.clear();
      return null;
    });
    await browser.keyboard.press('p');
    await expect.poll(() => presenterText(browser, '[data-testid="elapsed"]')).toBe('0:00');
    await clickInPresenter(browser, '[data-testid="timer-toggle"]');
    await expect
      .poll(() => presenterText(browser, '[data-testid="elapsed"]'), { timeout: 8_000 })
      .not.toBe('0:00');
    await clickInPresenter(browser, '[data-testid="timer-toggle"]');
    const paused = await presenterText(browser, '[data-testid="elapsed"]');
    await new Promise((resolve) => setTimeout(resolve, 1_300));
    expect(await presenterText(browser, '[data-testid="elapsed"]')).toBe(paused);
    await clickInPresenter(browser, '[data-testid="timer-reset"]');
    await expect.poll(() => presenterText(browser, '[data-testid="elapsed"]')).toBe('0:00');
    await closePresenter(browser);
  });

  test('blackout set in the presenter window covers the audience window', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${brandUrl('default')}#/1/0`);
    await browser.keyboard.press('p');
    await expect
      .poll(() => presenterText(browser, '[data-testid="slide-count"]'))
      .toContain('Slide 1');
    await pressInPresenter(browser, 'b');
    await expect(browser.locator('.dp-blackout[data-mode="black"]')).toBeVisible();
    await pressInPresenter(browser, 'b');
    await expect(browser.locator('.dp-blackout')).toBeHidden();
    await closePresenter(browser);
  });

  test('the audience window shows nothing presenter-related', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${brandUrl('default')}#/2/0`);
    await browser.keyboard.press('p');
    await expect.poll(() => presenterHas(browser, '[data-presenter-view]')).toBe(true);
    const audience = await browser.evaluate(() => ({
      view: document.querySelector('[data-presenter-view]') !== null,
      notes: document.querySelector('[data-testid="notes"]') !== null,
      timer: document.querySelector('[data-testid="elapsed"]') !== null,
      text: document.body.innerText.includes('Press the right arrow three times'),
    }));
    expect(audience).toEqual({ view: false, notes: false, timer: false, text: false });
    await closePresenter(browser);
  });

  test('reaches every step of a stepped slide from either window with the sidebar open', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${brandUrl('default')}#/1/0`);
    await browser.evaluate(() => {
      window.localStorage.setItem('deck-presenter:sidebar', 'open');
      return null;
    });
    await openDeck(fixtures, `${brandUrl('default')}?sidebar#/1/0`);
    await expect(browser.locator('.dp-sidebar')).toBeVisible();
    await browser.keyboard.press('p');
    await expect
      .poll(() => presenterText(browser, '[data-testid="slide-count"]'))
      .toContain('Slide 1 of 4');

    const forward = ['2/0', '2/1', '2/2', '2/3', '3/0'];
    const counts = ['step 0 of 3', 'step 1 of 3', 'step 2 of 3', 'step 3 of 3', 'Slide 3 of 4'];
    /**
     * Walks forward through the stepped slide and back out, checking both windows at each step.
     *
     * @param press - Presses a key in one of the windows.
     */
    const walk = async (press: (key: string) => Promise<unknown>) => {
      for (const [index, position] of forward.entries()) {
        await press('ArrowRight');
        await expect(browser).toHaveURL(new RegExp(`#/${position}$`));
        await expect
          .poll(() => presenterText(browser, '[data-testid="slide-count"]'))
          .toContain(counts[index] ?? '');
      }

      for (const position of [...forward].reverse().slice(1)) {
        await press('ArrowLeft');
        await expect(browser).toHaveURL(new RegExp(`#/${position}$`));
      }

      await press('ArrowLeft');
      await expect(browser).toHaveURL(/#\/1\/0$/);
    };
    await walk((key) => pressInPresenter(browser, key));
    await walk((key) => browser.keyboard.press(key));
    await closePresenter(browser);
    await browser.evaluate(() => {
      window.localStorage.removeItem('deck-presenter:sidebar');
      return null;
    });
  });

  test('keeps Space and PageDown navigating after a click on a presenter button', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${brandUrl('default')}#/2/0`);
    await browser.keyboard.press('p');
    await expect
      .poll(() => presenterText(browser, '[data-testid="slide-count"]'))
      .toContain('step 0 of 3');
    await clickInPresenter(browser, 'button[aria-label="Larger notes"]');
    await pressOnInPresenter(browser, 'button[aria-label="Larger notes"]', ' ');
    await expect(browser).toHaveURL(/#\/2\/1$/);
    await pressOnInPresenter(browser, '[data-testid="timer-toggle"]', ' ');
    await expect(browser).toHaveURL(/#\/2\/2$/);
    expect(await presenterText(browser, '[data-testid="timer-toggle"]')).toBe('Start');
    await pressOnInPresenter(browser, '[data-testid="current-slide"]', 'PageDown');
    await expect(browser).toHaveURL(/#\/2\/3$/);
    await closePresenter(browser);
  });
});
