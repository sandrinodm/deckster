// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import {
  click,
  find,
  press,
  renderPresenterDeck,
  type MountedPresenterDeck,
} from '#testing/presenter-deck.fixture.tsx';
import { closeTopOverlay, uiState, updateUi } from '#ui/ui-state.ts';

/**
 * The deck under test, unmounted after each test.
 */
let mounted: MountedPresenterDeck | undefined;

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
});

describe('the presenter tools on the keyboard', () => {
  it('moves nothing behind the help, and gives focus back when it closes', () => {
    mounted = renderPresenterDeck('/#/2/0');
    const before = document.createElement('button');
    document.body.append(before);
    before.focus();
    press('?');
    const dialog = find('dialog[aria-label="Keyboard shortcuts"]');
    expect(dialog.contains(document.activeElement)).toBe(true);
    press('ArrowRight', document.activeElement ?? window);
    press('PageDown');
    expect(window.__deck?.position).toEqual({ slide: 1, step: 0 });
    press('Escape');
    expect(document.querySelector('dialog[aria-label="Keyboard shortcuts"]')).toBeNull();
    expect(document.activeElement).toBe(before);
    before.remove();
  });

  it('keeps Tab inside the help', () => {
    mounted = renderPresenterDeck('/#/2/0');
    press('?');
    const close = find('button[aria-label="Close help"]');
    expect(document.activeElement).toBe(close);
    const tab = press('Tab', close);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);
  });

  it('uncovers the screen on the first navigation key instead of moving unseen', () => {
    mounted = renderPresenterDeck('/#/2/0');
    press('b');
    expect(uiState.get().blackout).toBe('black');
    press('ArrowRight');
    expect(uiState.get().blackout).toBeUndefined();
    expect(window.__deck?.position).toEqual({ slide: 1, step: 0 });
    press('ArrowRight');
    expect(window.__deck?.position).toEqual({ slide: 1, step: 1 });
  });

  it('closes overlays in the order they are stacked: the blackout first', () => {
    act(() => updateUi({ overviewOpen: true, helpOpen: true, gotoBuffer: '2', blackout: 'white' }));
    const closed: string[] = [];
    while (closeTopOverlay()) {
      const state = uiState.get();
      closed.push(
        [
          state.blackout === undefined ? '' : 'blackout',
          state.gotoBuffer === undefined ? '' : 'goto',
          state.helpOpen ? 'help' : '',
          state.overviewOpen ? 'overview' : '',
        ]
          .filter(Boolean)
          .join(','),
      );
    }

    expect(closed).toEqual(['goto,help,overview', 'help,overview', 'overview', '']);
  });

  it('moves focus into the overview, follows the selection and opens a slide with Space', () => {
    mounted = renderPresenterDeck('/#/1/0');
    press('o');
    expect(document.activeElement?.getAttribute('data-slide-index')).toBe('0');
    press('ArrowRight', document.activeElement ?? window);
    expect(document.activeElement?.getAttribute('data-slide-index')).toBe('1');
    press(' ', document.activeElement ?? window);
    expect(uiState.get().overviewOpen).toBe(false);
    expect(window.__deck?.position.slide).toBe(1);
  });

  it('ignores a click on the stage while the go-to prompt is open, closing the prompt', () => {
    mounted = renderPresenterDeck('/#/1/0');
    press('g');
    press('3');
    click(find('[data-slide-active="true"]'));
    expect(uiState.get().gotoBuffer).toBeUndefined();
    expect(window.__deck?.position).toEqual({ slide: 0, step: 0 });
  });
});
