// @vitest-environment happy-dom
import type { DeckManifest, SlideMeta } from '@deckster/engine';

import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vite-plus/test';

import {
  click,
  find,
  press,
  renderPresenterDeck,
  slide,
  type MountedPresenterDeck,
} from '#testing/presenter-deck.fixture.tsx';
import { updateUi } from '#ui/ui-state.ts';

/**
 * The frontmatter of a hidden test slide.
 */
const hiddenMeta: Partial<SlideMeta> = { frontmatter: { layout: 'default', hidden: true } };

/**
 * Three slides where the second is hidden.
 */
const DECK: DeckManifest = {
  id: 'presenter-hidden-lists',
  title: 'Hidden lists',
  brand: 'default',
  slides: [
    slide('one', () => <h1>One</h1>),
    slide('two', () => <h1>Two</h1>, hiddenMeta),
    slide('three', () => <h1>Three</h1>),
  ],
};

/**
 * The viewport height the sidebar's list measures; happy-dom lays nothing out.
 */
const LIST_HEIGHT_PX = 800;

/**
 * The real `clientHeight`, restored after the file.
 */
const clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

/**
 * The deck under test, unmounted after each test.
 */
let mounted: MountedPresenterDeck | undefined;

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => LIST_HEIGHT_PX,
  });
});

afterAll(() => {
  if (clientHeight !== undefined) {
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeight);
  }
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
});

describe('sidebar with a hidden slide', () => {
  it('dims it, badges it, keeps its full-list number and still goes to it', () => {
    mounted = renderPresenterDeck('/#/1/0', DECK);
    act(() => updateUi({ sidebarOpen: true }));
    const hidden = find('.dp-sidebar [data-slide-index="1"]');
    expect(hidden.hasAttribute('data-hidden')).toBe(true);
    expect(hidden.querySelector('.dp-chip[data-hidden]')?.textContent).toBe('Hidden');
    expect(hidden.querySelector('.dp-row-index')?.textContent).toBe('2');
    expect(find('.dp-sidebar [data-slide-index="0"]').hasAttribute('data-hidden')).toBe(false);
    expect(document.querySelectorAll('.dp-sidebar .dp-chip[data-hidden]')).toHaveLength(1);
    click(hidden);
    expect(window.__deck?.position.slide).toBe(1);
  });
});

describe('overview with a hidden slide', () => {
  it('dims it, badges it and opens it on Enter', () => {
    mounted = renderPresenterDeck('/#/1/0', DECK);
    press('o');
    const cell = find('.dp-overview [data-slide-index="1"]');
    expect(cell.hasAttribute('data-hidden')).toBe(true);
    expect(cell.querySelector('.dp-chip[data-hidden]')?.textContent).toBe('Hidden');
    expect(cell.querySelector('.dp-cell-index')?.textContent).toBe('2');
    expect(find('.dp-overview [data-slide-index="2"]').hasAttribute('data-hidden')).toBe(false);
    press('Enter', cell);
    expect(window.__deck?.position.slide).toBe(1);
  });
});

describe('go to prompt with a hidden slide', () => {
  it('takes full-list numbers and lands on a hidden slide', () => {
    mounted = renderPresenterDeck('/#/1/0', DECK);
    press('g');
    expect(find('.dp-goto').textContent).toContain('of 3');
    press('2');
    press('Enter');
    expect(window.__deck?.position.slide).toBe(1);
    press('ArrowRight');
    expect(window.__deck?.position.slide).toBe(2);
  });
});
