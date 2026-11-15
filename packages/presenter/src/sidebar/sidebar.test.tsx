// @vitest-environment happy-dom
import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test';

import {
  click,
  find,
  press,
  renderPresenterDeck,
  type MountedPresenterDeck,
} from '#testing/presenter-deck.fixture.tsx';
import { updateUi } from '#ui/ui-state.ts';

/**
 * The deck under test, unmounted after each test.
 */
let mounted: MountedPresenterDeck | undefined;

/**
 * The viewport height the sidebar's list measures; happy-dom lays nothing out.
 */
const LIST_HEIGHT_PX = 800;

/**
 * The real `clientHeight`, restored after the file.
 */
const clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

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
  vi.unstubAllGlobals();
});

/**
 * Opens the deck with the sidebar showing.
 *
 * @param url - The page URL.
 */
function openWithSidebar(url = '/#/1/0'): void {
  mounted = renderPresenterDeck(url);
  act(() => updateUi({ sidebarOpen: true }));
}

/**
 * The sidebar row of a zero-based slide.
 *
 * @param index - The slide.
 */
function row(index: number): HTMLElement {
  return find(`.dp-sidebar [data-slide-index="${index}"]`);
}

/**
 * Fires a drag event on a row, with the `dataTransfer` the sidebar reads.
 *
 * @param target - The row.
 * @param type - The drag event type.
 */
function drag(target: Element, type: string): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    clientY: 0,
    dataTransfer: { effectAllowed: '', setData: () => undefined },
  });
  act(() => {
    target.dispatchEvent(event);
  });
}

describe('Sidebar', () => {
  it('lists every slide with the current one selected', () => {
    openWithSidebar('/#/2/0');
    const rows = [...document.querySelectorAll('.dp-sidebar [role="option"]')];
    expect(rows.map((option) => option.getAttribute('aria-label'))).toEqual([
      'Slide 1: title',
      'Slide 2: How steps work',
      'Slide 3: closing',
    ]);
    expect(row(1).getAttribute('aria-selected')).toBe('true');
  });

  it('jumps to a slide on click, Enter or Space', () => {
    openWithSidebar();
    click(row(2));
    expect(window.__deck?.position.slide).toBe(2);
    press('Enter', row(1));
    expect(window.__deck?.position.slide).toBe(1);
    const space = press(' ', row(0));
    expect(window.__deck?.position.slide).toBe(0);
    expect(space.defaultPrevented).toBe(true);
  });

  it('shows why a reorder failed as an alert that can be dismissed', async () => {
    const fetch = vi.fn(async () =>
      Response.json(
        { error: 'deck.config.ts lists slides in a way I cannot edit.' },
        { status: 409 },
      ),
    );
    vi.stubGlobal('fetch', fetch);
    openWithSidebar();
    drag(row(0), 'dragstart');
    drag(row(2), 'dragover');
    drag(row(2), 'drop');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(find('[role="alert"]').textContent).toContain('Could not reorder: deck.config.ts');
    click(find('[role="alert"] button[aria-label="Dismiss"]'));
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });
});
