import type { Browser } from '@e2e-dev/web';

import { describe } from '@e2e-dev/web';
import { expect } from 'e2e';

import { CHARTS_URLS, useChartsServers } from './support/charts-servers.ts';
import { test } from './support/page-problems.ts';
import { openDeck } from './support/presenter-deck.ts';

/**
 * The one-based slide numbers of the data-stories deck the tests use.
 */
const SLIDE = {
  /**
   * The line chart with last year on screen first, then built in three steps: this year, a callout,
   * a bracket.
   */
  reveal: 3,

  /**
   * The area chart on the gradient surface.
   */
  gradient: 12,
} as const;

/**
 * What a test reads of a chart on the slide on screen.
 */
type ChartState = {
  /**
   * The `data-reveal` of each step group, by its step.
   */
  reveals: Record<string, string>;

  /**
   * The chart's `data-motion`.
   */
  motion: string;

  /**
   * The chart's `data-plate`.
   */
  plate: string;

  /**
   * The chart's computed background color.
   */
  background: string;

  /**
   * How many animations run inside the chart.
   */
  animations: number;

  /**
   * The chart's serialisable description.
   */
  spec: {
    kind: string;
    series: { name: string; color: string }[];
    colors: { plate: string };
    annotations: { type: string; label: string }[];
  } | null;
};

useChartsServers();

/**
 * Reads the chart on the slide on screen once the deck is ready.
 *
 * @param browser - The browser fixture.
 */
async function chartState(browser: Browser): Promise<ChartState> {
  await browser.evaluate(() => window.__deck?.ready().then(() => null) ?? null);
  const text = await browser.evaluate(() => {
    const chart = document.querySelector<HTMLElement>(
      'section[data-slide-active="true"] .kit-chart',
    );
    const reveals: Record<string, string> = {};
    for (const group of chart?.querySelectorAll<SVGGElement>('.kit-chart-step') ?? []) {
      reveals[group.dataset['step'] ?? ''] = group.dataset['reveal'] ?? '';
    }

    const spec = chart?.getAttribute('data-chart-spec') ?? null;
    return JSON.stringify({
      reveals,
      motion: chart?.dataset['motion'] ?? '',
      plate: chart?.dataset['plate'] ?? '',
      background:
        chart === null || chart === undefined ? '' : getComputedStyle(chart).backgroundColor,
      animations: chart?.getAnimations({ subtree: true }).length ?? 0,
      spec,
    });
  });
  const state = JSON.parse(text) as Omit<ChartState, 'spec'> & { spec: string | null };
  return {
    ...state,
    spec: state.spec === null ? null : (JSON.parse(state.spec) as ChartState['spec']),
  };
}

/**
 * Moves the open deck to a slide and step through the URL hash.
 *
 * @param browser - The browser fixture.
 * @param slide - The one-based slide number.
 * @param step - The deck step.
 */
async function goTo(browser: Browser, slide: number, step: number): Promise<void> {
  await browser.evaluate((hash: string) => {
    window.location.hash = hash;
    return null;
  }, `#/${slide}/${step}`);
}

describe('charts', () => {
  test('a progressive reveal shows the context first, then builds each step in', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${CHARTS_URLS.default}#/${SLIDE.reveal}/0`);
    const start = await chartState(browser);
    expect(start.reveals).toEqual({ '1': 'hidden', '2': 'hidden', '3': 'hidden' });
    expect(start.motion).toBe('on');

    await goTo(browser, SLIDE.reveal, 1);
    await expect.poll(async () => (await chartState(browser)).reveals['1']).toBe('play');
    expect((await chartState(browser)).reveals['2']).toBe('hidden');

    await goTo(browser, SLIDE.reveal, 2);
    await expect.poll(async () => (await chartState(browser)).reveals['2']).toBe('play');
    await goTo(browser, SLIDE.reveal, 3);
    await expect.poll(async () => (await chartState(browser)).reveals['3']).toBe('play');

    await goTo(browser, SLIDE.reveal, 1);
    await expect.poll(async () => (await chartState(browser)).reveals['2']).toBe('hidden');
  });

  test('static mode and each exported step show the end state with no motion', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${CHARTS_URLS.default}?static#/${SLIDE.reveal}/3`);
    const end = await chartState(browser);
    expect(end.motion).toBe('off');
    expect(end.reveals).toEqual({ '1': 'shown', '2': 'shown', '3': 'shown' });
    expect(end.animations).toBe(0);
    expect(end.spec?.kind).toBe('line');
    expect(end.spec?.series.map((series) => series.name)).toEqual(['2025', '2026']);
    expect(end.spec?.annotations).toHaveLength(2);

    await openDeck(fixtures, `${CHARTS_URLS.default}?static#/${SLIDE.reveal}/1`);
    const middle = await chartState(browser);
    expect(middle.reveals).toEqual({ '1': 'shown', '2': 'hidden', '3': 'hidden' });
    expect(middle.animations).toBe(0);
  });

  test('a chart re-themes under nocturne and draws the plate on a gradient surface', async (fixtures) => {
    const { browser } = fixtures;
    const seen: Record<string, { lead: string; plate: string; background: string; mode: string }> =
      {};
    for (const brand of ['default', 'nocturne'] as const) {
      await openDeck(fixtures, `${CHARTS_URLS[brand]}?static#/${SLIDE.reveal}/3`);
      const line = await chartState(browser);
      await openDeck(fixtures, `${CHARTS_URLS[brand]}?static#/${SLIDE.gradient}/0`);
      const gradient = await chartState(browser);
      seen[brand] = {
        lead: line.spec?.series.find((series) => series.name === '2026')?.color ?? '',
        plate: gradient.spec?.colors.plate ?? '',
        background: gradient.background,
        mode: gradient.plate,
      };
    }

    expect(seen['default']).toEqual({
      lead: '#2d4ae0',
      plate: '#0c0e13',
      background: 'rgb(12, 14, 19)',
      mode: 'visible',
    });
    expect(seen['nocturne']).toEqual({
      lead: '#ff8f6b',
      plate: '#0b0911',
      background: 'rgb(11, 9, 17)',
      mode: 'visible',
    });
  });
});
