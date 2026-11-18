import { useEffect, useEffectEvent, type RefObject } from 'react';
import { flushSync } from 'react-dom';

import type { DeckControls, MoveActions } from '#deck/deck-context.ts';
import type { SlideSummary } from '#deck/slide-summary.ts';
import type { Position } from '#navigation/navigation.ts';
import type { ReadinessRegistry } from '#readiness/readiness-registry.ts';

import { waitUntilReady } from '#runtime/ready.ts';

/**
 * The deck's automation API on `window.__deck`, used by Playwright, export, lint and screenshots.
 * Moves apply synchronously: once `goto` returns, the new slide is rendered; await `ready()` before
 * capturing it. They never morph, and a morph on its way when one is made finishes at once.
 */
export type DeckApi = {
  /**
   * The slides in order. Step counts are known for every slide that has mounted.
   */
  readonly slides: readonly SlideSummary[];

  /**
   * The slide and step on screen.
   */
  readonly position: Position;

  /**
   * Whether the deck runs in `?static` mode.
   */
  readonly isStatic: boolean;

  /**
   * Shows a slide, by zero-based index or id, at a step (default 0). Steps beyond the slide's last
   * step clamp to it. A step the slide has not registered yet because part of it is still loading
   * (a lazy chunk, a Suspense boundary, a `useReadyHold`) is kept and applied, clamped to the final
   * count, once the slide settles; `ready()` waits for that.
   *
   * @throws RangeError when the slide does not exist.
   */
  goto: (slide: number | string, step?: number) => void;

  /**
   * Shows the next step, or the next shown slide after the last step (hidden slides are skipped);
   * does nothing at the end.
   */
  next: () => void;

  /**
   * Shows the previous step, or the previous shown slide at its last step (hidden slides are
   * skipped); does nothing at the start.
   */
  prev: () => void;

  /**
   * Resolves once the slide on screen (every slide in static mode) is ready to capture: no
   * component holds it with `useReadyHold`, so steps that register late are counted, and fonts,
   * images and CSS background images have loaded. Step counts in `slides` are final for those
   * slides when it resolves, and a step `goto` asked for before they were has been applied.
   *
   * @throws Error (as a rejection) when a slide is still held after 30 seconds.
   */
  ready: () => Promise<void>;
};

declare global {
  /**
   * The browser window, with the deck's automation API while a deck is mounted.
   */
  // Augmenting the global Window needs interface declaration merging.
  // oxlint-disable-next-line typescript/consistent-type-definitions
  interface Window {
    /**
     * The deck's automation API, set while a deck is mounted and removed when it unmounts.
     */
    __deck?: DeckApi;
  }
}

/**
 * What {@link useDeckApi} reads to publish the API: the deck's controls, moves and readiness.
 */
export type DeckApiInput = {
  /**
   * The deck's current controls; the API always reads the latest ones.
   */
  controls: DeckControls;

  /**
   * The moves without morphs, which `goto`, `next` and `prev` apply synchronously.
   */
  immediate: MoveActions;

  /**
   * Finishes a morph on its way, before a move of the API applies.
   */
  settle: () => void;

  /**
   * The deck's root element, searched for images by `ready()`.
   */
  rootRef: RefObject<HTMLElement | null>;

  /**
   * The holds `ready()` waits for.
   */
  readiness: ReadinessRegistry;

  /**
   * Whether a requested step waits for its slide to settle, which `ready()` waits for too.
   */
  stepPending: boolean;
};

/**
 * Publishes the deck's controls as `window.__deck` while the deck is mounted.
 *
 * @param input - The controls, the immediate moves, the deck's root and its readiness.
 */
export function useDeckApi(input: DeckApiInput): void {
  const { controls, immediate, settle, rootRef, readiness, stepPending } = input;
  const read = useEffectEvent(() => controls);
  const isPending = useEffectEvent(() => stepPending);
  const settledMoves = useEffectEvent(() => {
    settle();
    return immediate;
  });

  useEffect(() => {
    const api: DeckApi = {
      get slides() {
        return read().slides;
      },
      get position() {
        return read().position;
      },
      get isStatic() {
        return read().isStatic;
      },
      goto: (slide, step) => {
        const actions = settledMoves();
        flushSync(() => actions.goto(slide, step));
      },
      next: () => {
        const actions = settledMoves();
        flushSync(() => actions.next());
      },
      prev: () => {
        const actions = settledMoves();
        flushSync(() => actions.prev());
      },
      ready: () => {
        const root = rootRef.current;
        if (root === null) {
          return Promise.resolve();
        }

        const { isStatic, slides, position } = read();
        const targets = isStatic ? slides.map((slide) => slide.index) : [position.slide];
        return waitUntilReady({ root, slides: targets, readiness, isPending });
      },
    };
    window.__deck = api;
    return () => {
      if (window.__deck === api) {
        delete window.__deck;
      }
    };
  }, [rootRef, readiness]);
}
