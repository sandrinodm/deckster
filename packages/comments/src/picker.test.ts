// @vitest-environment happy-dom
import type { DeckControls } from '@deckster/engine';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { handleCommentKey } from '#overlay/comment-keys.ts';
import { commentsState, resetComments, setCommentMode } from '#overlay/comments-state.ts';
import { findStamped, pickElement, type PickedElement } from '#picker.ts';

/**
 * A slide with a stamped heading inside a stamped section.
 */
const PAGE = `
<div class="deck-main"><div class="deck-canvas">
  <section class="deck-slide" data-slide-active="true" data-slide-id="title">
    <div data-deck-source="slides/title.mdx:5:1">
      <h1 data-deck-source="slides/title.mdx:7:1">Hello,   deck</h1>
    </div>
  </section>
</div></div>`;

/**
 * The controls the key handler reads.
 */
const DECK = { isStatic: false } as DeckControls;

beforeAll(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, 0, 100, 20),
  );
});

afterAll(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  document.body.innerHTML = PAGE;
  resetComments();
});

/**
 * Sends a key press to the comment overlay's key handler.
 *
 * @param key - The `KeyboardEvent.key`.
 */
function press(key: string): boolean {
  return handleCommentKey(new KeyboardEvent('keydown', { key }), DECK);
}

describe('pickElement', () => {
  it('turns comment mode on, hands the keyboard pick over and creates no draft', () => {
    const picked: PickedElement[] = [];
    pickElement({ onPick: (element) => picked.push(element) });
    expect(commentsState()).toMatchObject({ mode: true });
    expect(press('Tab')).toBe(true);
    expect(press('Tab')).toBe(true);
    expect(press('Enter')).toBe(true);
    expect(picked).toEqual([
      expect.objectContaining({
        tag: 'h1',
        text: 'Hello, deck',
        stamp: 'slides/title.mdx:7:1',
        label: 'h1 · slides/title.mdx:7',
        chrome: false,
      }),
    ]);
    expect(commentsState()).toMatchObject({ mode: false, pick: undefined, draft: undefined });
  });

  it('cancels on Escape and when comment mode is turned off', () => {
    let cancelled = 0;
    pickElement({ onPick: () => undefined, onCancel: () => (cancelled += 1) });
    expect(press('Escape')).toBe(true);
    expect(cancelled).toBe(1);
    expect(commentsState().mode).toBe(false);

    pickElement({ onPick: () => undefined, onCancel: () => (cancelled += 1) });
    setCommentMode(false);
    expect(cancelled).toBe(2);
    expect(commentsState().pick).toBeUndefined();
  });

  it('cancels the earlier pick when a new one starts, and the returned function cancels', () => {
    let cancelled = 0;
    pickElement({ onPick: () => undefined, onCancel: () => (cancelled += 1) });
    const cancel = pickElement({ onPick: () => undefined, onCancel: () => (cancelled += 1) });
    expect(cancelled).toBe(1);
    cancel();
    expect(cancelled).toBe(2);
  });
});

describe('findStamped', () => {
  it('finds the element with a stamp on the slide on screen', () => {
    expect(findStamped('slides/title.mdx:7:1')?.tagName).toBe('H1');
    expect(findStamped('slides/title.mdx:99:1')).toBeUndefined();
  });
});
