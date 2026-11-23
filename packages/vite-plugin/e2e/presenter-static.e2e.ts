import { describe } from '@e2e-dev/web';
import { expect } from 'e2e';

import { BASELINE_URL, useBaselineServer } from './support/baseline-server.ts';
import { useBrandServers } from './support/brand-servers.ts';
import { brandUrl } from './support/brands.ts';
import { test } from './support/page-problems.ts';
import { openDeck } from './support/presenter-deck.ts';

useBrandServers();
useBaselineServer();

describe('static mode, which deckster shot and deckster lint use', () => {
  test('renders exactly what it renders without the presenter tools', async (fixtures) => {
    const { browser } = fixtures;
    const markup: string[] = [];
    for (const base of [BASELINE_URL, brandUrl('default')]) {
      await openDeck(fixtures, `${base}?static#/2/3`);
      await browser.evaluate(async () => {
        await window.__deck?.ready();
        return null;
      });
      markup.push(
        await browser.evaluate(() => document.getElementById('deck-root')?.innerHTML ?? ''),
      );
    }

    expect(markup[0]).not.toBe('');
    expect(markup[1]).toBe(markup[0]);
  });

  test('draws no presenter UI and ignores the presenter keys', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${brandUrl('default')}?static#/1/0`);
    for (const key of ['s', 'o', 'b', 'g', '?', 'l']) {
      await browser.keyboard.press(key);
    }

    const found = await browser.evaluate(() => ({
      ui: document.querySelectorAll('.dp-ui').length,
      interactive: document.querySelectorAll('[data-deck-interactive]').length,
      stage: document.querySelectorAll('.dp-stage').length,
    }));
    expect(found).toEqual({ ui: 0, interactive: 0, stage: 0 });
  });
});
