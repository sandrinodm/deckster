// @vitest-environment happy-dom
import type { DeckControls } from '@deckster/engine';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { handleCommentKey } from '#overlay/comment-keys.ts';
import {
  closeDraft,
  commentsState,
  discardDraft,
  resetComments,
  setCommentMode,
  startDraft,
  updateComments,
} from '#overlay/comments-state.ts';

/**
 * A slide with two stamped list items inside a stamped list, and a toolbar button.
 */
const PAGE = `
<div class="deck-main"><div class="deck-canvas">
  <section class="deck-slide" data-slide-active="true" data-slide-id="intro">
    <ul data-deck-source="slides/intro.mdx:3:1">
      <li data-deck-source="slides/intro.mdx:4:1">One</li>
      <li data-deck-source="slides/intro.mdx:5:1">Two</li>
    </ul>
  </section>
</div></div>
<div class="dp-ui dc-root"><button type="button" id="done">Done</button></div>`;

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
  setCommentMode(true);
});

/**
 * Sends a key press to the handler.
 *
 * @param key - The `KeyboardEvent.key`.
 * @param init - Modifiers, and the element it comes from.
 * @returns Whether the handler used it.
 */
function press(key: string, init: { shiftKey?: boolean; from?: Element } = {}): boolean {
  const event = new KeyboardEvent('keydown', { key, shiftKey: init.shiftKey ?? false });
  if (init.from !== undefined) {
    Object.defineProperty(event, 'target', { value: init.from });
  }

  return handleCommentKey(event, DECK);
}

/**
 * The stamp of the element picked or hovered now.
 */
function picked(): string | undefined {
  return commentsState().hover?.stamp;
}

/**
 * The element a selector names.
 *
 * @param selector - A CSS selector.
 */
function find(selector: string): Element {
  const element = document.querySelector(selector);
  if (element === null) {
    throw new Error(`No element matches ${selector}`);
  }

  return element;
}

describe('picking by keyboard', () => {
  it('tabs through the slide’s stamped elements, then lets Tab go on to the toolbar', () => {
    expect(press('Tab')).toBe(true);
    expect(picked()).toBe('slides/intro.mdx:3:1');
    press('Tab');
    expect(picked()).toBe('slides/intro.mdx:4:1');
    press('Tab', { shiftKey: true });
    expect(picked()).toBe('slides/intro.mdx:3:1');
    press('Tab');
    press('Tab');
    expect(press('Tab')).toBe(false);
    expect(picked()).toBeUndefined();
  });

  it('leaves Tab to the toolbar and the panel', () => {
    expect(press('Tab', { from: find('#done') })).toBe(false);
  });

  it('walks the pick with the arrows and selects it with Enter', () => {
    press('Tab');
    press('Tab');
    expect(press('ArrowUp')).toBe(true);
    expect(picked()).toBe('slides/intro.mdx:3:1');
    expect(press('ArrowDown')).toBe(true);
    expect(picked()).toBe('slides/intro.mdx:4:1');
    expect(press('Enter')).toBe(true);
    const { draft } = commentsState();
    expect(draft?.kind === 'element' ? draft.target.stamp : undefined).toBe('slides/intro.mdx:4:1');
  });

  it('leaves the arrows to the deck while the pointer only hovers', () => {
    updateComments({ hover: { element: find('li'), stamp: 'slides/intro.mdx:4:1' } });
    expect(press('ArrowDown')).toBe(false);
    expect(press('Enter')).toBe(false);
  });
});

describe('drafts', () => {
  /**
   * A draft on a list item.
   *
   * @param selector - The item.
   */
  const itemDraft = (selector: string) => ({
    kind: 'element' as const,
    target: {
      element: find(selector),
      stamp: find(selector).getAttribute('data-deck-source') ?? '',
    },
    trail: [],
  });

  it('keeps the text typed for a target when Escape closes the composer', () => {
    startDraft(itemDraft('li'));
    updateComments({ draftText: 'Shorter', draftType: 'fix' });
    expect(press('Escape')).toBe(true);
    expect(commentsState()).toMatchObject({ draft: undefined, draftText: '', mode: true });
    expect(commentsState().toast).toContain('Draft kept');
    startDraft(itemDraft('li + li'));
    expect(commentsState().draftText).toBe('');
    startDraft(itemDraft('li'));
    expect(commentsState()).toMatchObject({ draftText: 'Shorter', draftType: 'fix' });
  });

  it('keeps each target’s text when the selection moves between targets', () => {
    startDraft(itemDraft('li'));
    updateComments({ draftText: 'First' });
    startDraft(itemDraft('li + li'));
    updateComments({ draftText: 'Second' });
    startDraft(itemDraft('li'));
    expect(commentsState().draftText).toBe('First');
    startDraft(itemDraft('li + li'));
    expect(commentsState().draftText).toBe('Second');
  });

  it('carries the text along when the selection walks to the parent', () => {
    startDraft(itemDraft('li'));
    updateComments({ draftText: 'About the list' });
    expect(press('ArrowUp')).toBe(true);
    expect(commentsState()).toMatchObject({ draftText: 'About the list' });
    const { draft } = commentsState();
    expect(draft?.kind === 'element' ? draft.target.stamp : undefined).toBe('slides/intro.mdx:3:1');
  });

  it('keeps the draft when comment mode is left, and drops it only when discarded', () => {
    startDraft(itemDraft('li'));
    updateComments({ draftText: 'Keep me' });
    setCommentMode(false);
    setCommentMode(true);
    startDraft(itemDraft('li'));
    expect(commentsState().draftText).toBe('Keep me');
    discardDraft();
    startDraft(itemDraft('li'));
    expect(commentsState().draftText).toBe('');
    expect(closeDraft()).toBe(false);
  });
});
