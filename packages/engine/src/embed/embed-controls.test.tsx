// @vitest-environment happy-dom
import { act, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { manifestOf, mdxSlide, press, renderDeck, type MountedDeck } from '#deck/deck.fixture.tsx';
import { EMBED_CONTROLS_IDLE_MS } from '#embed/embed-controls.tsx';
import { definePlugin } from '#plugins/deck-plugin.ts';
import { Step } from '#steps/step.tsx';

/**
 * Three slides: one step, two steps, one step.
 */
const DECK = manifestOf(
  mdxSlide('first', () => <p>first</p>),
  mdxSlide('second', () => (
    <Step at={1}>
      <p>second 1</p>
    </Step>
  )),
  mdxSlide('third', () => <p>third</p>),
);

/**
 * A plugin with every part embed mode drops, each marked so a test can look for it.
 */
const TOOLS = definePlugin({
  name: 'tools',
  stage: ({ children }: { children: ReactNode }) => <div data-testid="tool-stage">{children}</div>,
  overlay: () => <div data-testid="tool-overlay" />,
  chrome: () => <div data-testid="tool-chrome" />,
  onKeyDown: (event) => event.key === 'ArrowRight',
});

let mounted: MountedDeck | undefined;

beforeEach(() => {
  window.history.replaceState(null, '', '#');
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  vi.useRealTimers();
});

/**
 * The element with a `data-testid`, or `null`.
 *
 * @param id - The test id.
 */
function byTestId(id: string): HTMLElement | null {
  return document.querySelector(`[data-testid="${id}"]`);
}

/**
 * The embed control's button with an accessible label.
 *
 * @param label - `Previous` or `Next`.
 */
function button(label: string): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
}

/**
 * A button's `aria-disabled` attribute: `'true'` at the end of the deck it cannot step past.
 *
 * @param label - `Previous` or `Next`.
 */
function ariaDisabled(label: string): string | null {
  return button(label).getAttribute('aria-disabled');
}

/**
 * The embed control's link to the whole deck.
 */
function openLink(): HTMLAnchorElement {
  return document.querySelector<HTMLAnchorElement>('.deck-embed-open')!;
}

/**
 * The embed control's `data-idle` attribute: `'true'` while it is faded out.
 */
function idle(): string | null | undefined {
  return byTestId('deck-embed')?.getAttribute('data-idle');
}

/**
 * Runs fake timers forward inside `act()`.
 *
 * @param ms - How far to advance, in milliseconds.
 */
function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/**
 * Dispatches a window event inside `act()`.
 *
 * @param event - The event to dispatch.
 */
function dispatch(event: Event): void {
  act(() => {
    window.dispatchEvent(event);
  });
}

/**
 * Clicks an element inside `act()`.
 *
 * @param element - The element to click.
 */
function click(element: HTMLElement): void {
  act(() => {
    element.click();
  });
}

describe('EmbedControls', () => {
  it('replaces plugin stages, overlays and key handlers with the embed control', () => {
    mounted = renderDeck(DECK, { plugins: [TOOLS], isEmbed: true });
    expect(byTestId('tool-stage')).toBeNull();
    expect(byTestId('tool-overlay')).toBeNull();
    expect(byTestId('tool-chrome')).not.toBeNull();
    expect(byTestId('deck-embed')?.textContent).toContain('Slide 1 of 3');
    expect(document.querySelector('.deck-viewport')?.getAttribute('data-embed')).toBe('true');

    press('ArrowRight');
    expect(window.location.hash).toBe('#/2/0');
  });

  it('shows no embed control outside embed mode', () => {
    mounted = renderDeck(DECK, { plugins: [TOOLS] });
    expect(byTestId('deck-embed')).toBeNull();
    expect(byTestId('tool-overlay')).not.toBeNull();
  });

  it('steps with Previous and Next and replaces the history entry', () => {
    mounted = renderDeck(DECK, { isEmbed: true });
    const entries = window.history.length;
    expect(ariaDisabled('Previous')).toBe('true');
    click(button('Previous'));
    expect(window.location.hash).toBe('#/1/0');

    click(button('Next'));
    click(button('Next'));
    expect(window.location.hash).toBe('#/2/1');
    expect(byTestId('deck-embed')?.textContent).toContain('Slide 2 of 3');

    click(button('Previous'));
    expect(window.location.hash).toBe('#/2/0');
    expect(window.history.length).toBe(entries);
  });

  it('disables Next on the last step of the last slide', () => {
    window.history.replaceState(null, '', '#/3/0');
    mounted = renderDeck(DECK, { isEmbed: true });
    expect(ariaDisabled('Next')).toBe('true');
    expect(ariaDisabled('Previous')).toBe('false');
  });

  it('keeps focus on Next when it reaches the end, and does nothing on another click', () => {
    window.history.replaceState(null, '', '#/2/1');
    mounted = renderDeck(DECK, { isEmbed: true });
    const next = button('Next');
    act(() => {
      next.focus();
    });
    click(next);
    expect(window.location.hash).toBe('#/3/0');
    expect(ariaDisabled('Next')).toBe('true');
    expect(next.disabled).toBe(false);
    expect(document.activeElement).toBe(next);

    click(next);
    expect(window.location.hash).toBe('#/3/0');
    expect(document.activeElement).toBe(next);
  });

  it('links to the whole deck at the position on screen, in a new tab', () => {
    window.history.replaceState(null, '', '?embed#/2/1');
    mounted = renderDeck(DECK, { isEmbed: true });
    const link = openLink();
    expect(link.getAttribute('href')).toBe(`${window.location.pathname}#/2/1`);
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener');

    press('ArrowRight');
    expect(link.getAttribute('href')).toBe(`${window.location.pathname}#/3/0`);
  });

  it('leaves focus where it was', () => {
    mounted = renderDeck(DECK, { isEmbed: true });
    expect(document.activeElement).toBe(document.body);
  });

  it('keeps the full count and link text for assistive technology next to the short forms', () => {
    mounted = renderDeck(DECK, { isEmbed: true });
    const short = document.querySelector('.deck-embed-short');
    expect(short?.textContent).toBe('1/3');
    expect(short?.getAttribute('aria-hidden')).toBe('true');
    expect(openLink().textContent).toBe('Open full deck');
    expect(openLink().querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('fades out after the idle delay and comes back on pointer, key and focus input', () => {
    vi.useFakeTimers();
    mounted = renderDeck(DECK, { isEmbed: true });
    expect(idle()).toBe('false');

    advance(EMBED_CONTROLS_IDLE_MS - 1);
    expect(idle()).toBe('false');
    advance(1);
    expect(idle()).toBe('true');

    dispatch(new Event('pointermove'));
    expect(idle()).toBe('false');
    advance(EMBED_CONTROLS_IDLE_MS);
    expect(idle()).toBe('true');

    press('Shift');
    expect(idle()).toBe('false');
    advance(EMBED_CONTROLS_IDLE_MS);
    expect(idle()).toBe('true');

    dispatch(new FocusEvent('focusin'));
    expect(idle()).toBe('false');
  });

  it('restarts the idle delay on each input', () => {
    vi.useFakeTimers();
    mounted = renderDeck(DECK, { isEmbed: true });
    advance(EMBED_CONTROLS_IDLE_MS - 500);
    dispatch(new Event('pointerdown'));
    advance(EMBED_CONTROLS_IDLE_MS - 500);
    expect(idle()).toBe('false');
  });
});
