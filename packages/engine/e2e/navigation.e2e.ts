import { describe } from '@e2e-dev/web';
import { expect } from 'e2e';

import {
  activeSlide,
  HELLO_SLIDES,
  HELLO_STEP_COUNTS,
  liveStep,
  openDeck,
  stepItem,
} from './support/deck.ts';
import { test } from './support/page-problems.ts';

describe('keyboard navigation', () => {
  test('steps through slides and steps, and updates the hash', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, '/');
    await expect(browser).toHaveURL(/#\/1\/0$/);

    await browser.keyboard.press('ArrowRight');
    await expect(browser).toHaveURL(/#\/2\/0$/);
    await expect(stepItem(browser, 1)).toBeHidden();

    await browser.keyboard.press('ArrowRight');
    await expect(browser).toHaveURL(/#\/2\/1$/);
    await expect(stepItem(browser, 1)).toBeVisible();
    await expect(stepItem(browser, 2)).toBeHidden();

    await browser.keyboard.press('Space');
    await expect(browser).toHaveURL(/#\/2\/2$/);
    await expect(stepItem(browser, 2)).toBeVisible();

    await browser.keyboard.press('PageDown');
    await expect(browser).toHaveURL(/#\/2\/3$/);
    await expect(stepItem(browser, 3)).toBeVisible();

    await browser.keyboard.press('ArrowDown');
    await expect(browser).toHaveURL(/#\/3\/0$/);
    await expect(liveStep(browser)).toHaveText('This slide is on step 0.');

    await browser.keyboard.press('ArrowRight');
    await expect(browser).toHaveURL(/#\/3\/1$/);
    await expect(liveStep(browser)).toHaveText('This slide is on step 1.');

    await browser.keyboard.press('ArrowRight');
    await expect(browser).toHaveURL(/#\/4\/0$/);
    await browser.keyboard.press('ArrowRight');
    await expect(browser).toHaveURL(/#\/4\/0$/);
  });

  test('enters a slide backwards on its last step', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, '/#/4/0');
    await browser.keyboard.press('ArrowLeft');
    await expect(browser).toHaveURL(/#\/3\/1$/);

    await browser.keyboard.press('PageUp');
    await browser.keyboard.press('ArrowUp');
    await expect(browser).toHaveURL(/#\/2\/3$/);
    await expect(stepItem(browser, 3)).toBeVisible();

    await browser.keyboard.press('Shift+Space');
    await expect(browser).toHaveURL(/#\/2\/2$/);
    await expect(stepItem(browser, 3)).toBeHidden();
  });

  test('jumps to the first and last slide with Home and End', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, '/#/2/1');
    await browser.keyboard.press('End');
    await expect(browser).toHaveURL(/#\/4\/0$/);
    await browser.keyboard.press('Home');
    await expect(browser).toHaveURL(/#\/1\/0$/);
  });
});

describe('URL hash', () => {
  test('opens the slide and step it names, by number or id', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, '/#/2/2');
    await expect(stepItem(browser, 2)).toBeVisible();
    await expect(stepItem(browser, 3)).toBeHidden();

    await openDeck(fixtures, '/#/live-counter/1');
    await expect(browser).toHaveURL(/#\/3\/1$/);
    await expect(liveStep(browser)).toHaveText('This slide is on step 1.');
  });

  test('clamps a step beyond the last one', async (fixtures) => {
    await openDeck(fixtures, '/#/2/9');
    await expect(fixtures.browser).toHaveURL(/#\/2\/3$/);
  });

  test('moves the deck when the hash is edited', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, '/');
    await browser.evaluate(() => {
      window.location.hash = '#/3/1';
      return null;
    });
    await expect(activeSlide(browser)).toHaveAttribute('data-slide-id', 'live-counter');
    await expect(liveStep(browser)).toHaveText('This slide is on step 1.');
  });
});

describe('window.__deck', () => {
  test('lists slides with titles, notes and step counts', async (fixtures) => {
    await openDeck(fixtures, '/');
    const slides = await fixtures.browser.evaluate(() =>
      window.__deck!.slides.map(({ id, title, notes, stepCount, budget }) => ({
        id,
        title,
        notes,
        stepCount: stepCount ?? null,
        budget: budget ?? null,
      })),
    );
    expect(slides.map((slide) => slide.id)).toEqual(HELLO_SLIDES);
    expect(slides.map((slide) => slide.title)).toEqual([
      'Hello, deck',
      'How steps work',
      'A TSX slide',
      'Thank you',
    ]);
    expect(slides[1]?.notes).toBe(
      'Press the right arrow three times to reveal each point.\n\n' +
        'Mention that the step count comes from the steps that mount.',
    );
    expect(slides[2]?.notes).toBe('TSX is the escape hatch for slides that need real code.');
    expect(slides[3]?.notes).toBe('');
    expect(slides.slice(0, 2).map((slide) => slide.stepCount)).toEqual([1, 4]);
    expect(slides.map((slide) => slide.budget)).toEqual([30, 90, 45, null]);
  });

  test('drives the deck with goto and ready', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, '/');
    await browser.evaluate(() => window.__deck!.ready().then(() => null));

    const position = await browser.evaluate(() => {
      window.__deck!.goto('steps', 2);
      return { ...window.__deck!.position };
    });
    expect(position).toEqual({ slide: 1, step: 2 });
    await expect(browser).toHaveURL(/#\/2\/2$/);
    await expect(stepItem(browser, 2)).toBeVisible();
    await expect(stepItem(browser, 3)).toBeHidden();

    const imageLoaded = await browser.evaluate(async () => {
      window.__deck!.goto(3);
      await window.__deck!.ready();
      const image = document.querySelector<HTMLImageElement>('[data-slide-active="true"] img');
      return image !== null && image.complete && image.naturalWidth > 0;
    });
    expect(imageLoaded).toBe(true);
    await expect(browser).toHaveURL(/#\/4\/0$/);

    const clamped = await browser.evaluate(() => {
      window.__deck!.goto(1, 99);
      return { ...window.__deck!.position };
    });
    expect(clamped).toEqual({ slide: 1, step: 3 });
  });

  test('keeps the step count of a slide after it unmounts', async (fixtures) => {
    await openDeck(fixtures, '/#/2/0');
    const result = await fixtures.browser.evaluate(async () => {
      window.__deck!.goto('closing');
      await window.__deck!.ready();
      const mounted = document.querySelector('[data-slide-id="steps"]') !== null;
      return { mounted, stepCount: window.__deck!.slides[1]?.stepCount ?? null };
    });
    expect(result).toEqual({ mounted: false, stepCount: 4 });
  });

  test('rejects a slide that does not exist', async (fixtures) => {
    await openDeck(fixtures, '/');
    const message = await fixtures.browser.evaluate(() => {
      try {
        window.__deck!.goto('nope');
        return 'no error';
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    });
    expect(message).toContain('No slide with id "nope"');
  });
});

describe('static mode', () => {
  test('mounts every slide so all step counts are known after ready()', async (fixtures) => {
    await openDeck(fixtures, '/?static');
    const state = await fixtures.browser.evaluate(async () => {
      await window.__deck!.ready();
      return {
        isStatic: window.__deck!.isStatic,
        mounted: document.querySelectorAll('[data-slide-id]').length,
        stepCounts: window.__deck!.slides.map((slide) => slide.stepCount ?? null),
      };
    });
    expect(state).toEqual({
      isStatic: true,
      mounted: HELLO_SLIDES.length,
      stepCounts: HELLO_STEP_COUNTS,
    });
  });
});

describe('canvas', () => {
  test('scales the 1920x1080 canvas to fit the viewport', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, '/');
    const canvas = browser.locator('.deck-canvas');
    const box = await canvas.boundingBox();
    expect(box?.width).toBeCloseTo(1280, 0);
    expect(box?.height).toBeCloseTo(720, 0);

    await browser.setViewport({ width: 1000, height: 1000 });
    await expect.poll(async () => (await canvas.boundingBox())?.width).toBeCloseTo(1000, 0);
    const letterboxed = await canvas.boundingBox();
    expect(letterboxed?.height).toBeCloseTo(562.5, 0);
    expect(letterboxed?.y).toBeCloseTo((1000 - 562.5) / 2, 0);
  });
});

describe('layout stamp', () => {
  test('marks the slide on screen with the layout its frontmatter names', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, '/');
    await expect(activeSlide(browser)).toHaveAttribute('data-deck-layout', 'default');
  });
});
