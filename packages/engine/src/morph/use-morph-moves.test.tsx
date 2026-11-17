// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { manifestOf, mdxSlide, press, renderDeck, type MountedDeck } from '#deck/deck.fixture.tsx';
import { MORPH_ARRIVED_ATTRIBUTE, MORPH_ATTRIBUTE } from '#morph/morph-elements.ts';

/**
 * A view transition the test drives by hand: it runs its update when told to, or when skipped
 * before then, as a browser does.
 */
type FakeTransition = {
  /**
   * Runs the update, as the browser does once it has captured the old state.
   */
  run: () => void;

  /**
   * Whether `skipTransition` was called.
   */
  skipped: boolean;

  /**
   * Ends the animation.
   */
  finish: () => void;
};

/**
 * The view transitions started on the canvas, in order.
 */
let started: FakeTransition[] = [];

/**
 * The deck under test, unmounted after each test.
 */
let mounted: MountedDeck | undefined;

/**
 * A slide showing one element with a morph name, and its text.
 */
function morphSlide(id: string, name: string) {
  return mdxSlide(id, () => <p {...{ [MORPH_ATTRIBUTE]: name }}>{id}</p>);
}

/**
 * The deck the tests move through: two slides that share `logo`, then one that does not.
 */
const MORPH_DECK = manifestOf(
  morphSlide('first', 'logo'),
  morphSlide('second', 'logo'),
  morphSlide('third', 'other'),
);

/**
 * Each morph element's text (its slide's id), transition name and whether it is marked away.
 */
function morphNames(): string[] {
  return [...document.querySelectorAll<HTMLElement>(`[${MORPH_ATTRIBUTE}]`)].map((element) => {
    const away = element.hasAttribute('data-morph-away') ? ' away' : '';
    return `${element.textContent}:${element.style.viewTransitionName || '-'}${away}`;
  });
}

/**
 * The text of each element marked as arrived by a morph.
 */
function arrived(): (string | null)[] {
  return [...document.querySelectorAll(`[${MORPH_ARRIVED_ATTRIBUTE}]`)].map(
    (element) => element.textContent,
  );
}

beforeEach(() => {
  window.history.replaceState(null, '', '#');
  started = [];
  Object.defineProperty(HTMLElement.prototype, 'startViewTransition', {
    configurable: true,
    value: fakeStartViewTransition,
  });
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  Reflect.deleteProperty(HTMLElement.prototype, 'startViewTransition');
});

describe('Deck morphs', () => {
  it('morphs to a neighbour that shares a name, then clears the names', async () => {
    mounted = renderDeck(MORPH_DECK);
    press('ArrowRight');
    expect(started).toHaveLength(1);
    expect(window.__deck?.position, 'the move waits for the old state').toEqual({
      slide: 0,
      step: 0,
    });
    expect(morphNames()).toEqual(['first:deck-morph-0', 'second:-']);
    act(() => started[0]?.run());
    expect(window.__deck?.position).toEqual({ slide: 1, step: 0 });
    expect(morphNames()).toEqual(['first:- away', 'second:deck-morph-0', 'third:-']);
    await act(async () => started[0]?.finish());
    expect(morphNames()).toEqual(['first:-', 'second:-', 'third:-']);
    expect(arrived(), 'the arrival mark stays while the slide is on screen').toEqual(['second']);
    press('ArrowRight');
    expect(arrived()).toEqual([]);
  });

  it('applies a move made before the morph runs in the same update', () => {
    mounted = renderDeck(MORPH_DECK);
    press('ArrowRight');
    press('ArrowLeft');
    expect(started).toHaveLength(1);
    act(() => started[0]?.run());
    expect(window.__deck?.position).toEqual({ slide: 0, step: 0 });
    expect(morphNames(), 'back where it started, the element stays').toEqual([
      'first:deck-morph-0',
      'second:-',
    ]);
  });

  it('ends a running morph before the next move', () => {
    mounted = renderDeck(MORPH_DECK);
    press('ArrowRight');
    act(() => started[0]?.run());
    press('ArrowRight');
    expect(started[0]?.skipped).toBe(true);
    expect(started, 'no name is shared with the third slide').toHaveLength(1);
    expect(window.__deck?.position).toEqual({ slide: 2, step: 0 });
    expect(morphNames()).toEqual(['second:-', 'third:-']);
  });

  it('keeps window.__deck synchronous: it never morphs and finishes a morph on its way', () => {
    mounted = renderDeck(MORPH_DECK);
    window.__deck?.next();
    expect(started).toHaveLength(0);
    expect(window.__deck?.position).toEqual({ slide: 1, step: 0 });
    press('ArrowLeft');
    expect(started).toHaveLength(1);
    window.__deck?.goto('third');
    expect(started[0]?.skipped).toBe(true);
    expect(window.__deck?.position).toEqual({ slide: 2, step: 0 });
    expect(morphNames()).toEqual(['second:-', 'third:-']);
    act(() => started[0]?.run());
    expect(window.__deck?.position, 'the late update changes nothing').toEqual({
      slide: 2,
      step: 0,
    });
  });

  it('does not morph in static mode', () => {
    mounted = renderDeck(MORPH_DECK, { isStatic: true });
    press('ArrowRight');
    expect(started).toHaveLength(0);
    expect(window.__deck?.position).toEqual({ slide: 1, step: 0 });
  });
});

/**
 * Stands in for `Element.startViewTransition`, recording each transition for the test to drive.
 *
 * @param update - The update the deck passes.
 */
function fakeStartViewTransition(update: () => void): Partial<ViewTransition> {
  let ran = false;
  let finish = () => {};
  const finished = new Promise<undefined>((resolve) => {
    finish = () => resolve(undefined);
  });
  const fake: FakeTransition = {
    run: () => {
      if (!ran) {
        ran = true;
        update();
      }
    },
    skipped: false,
    finish,
  };
  started.push(fake);
  return {
    ready: Promise.resolve(undefined),
    finished,
    skipTransition: () => {
      fake.skipped = true;
      fake.run();
      finish();
    },
  };
}
