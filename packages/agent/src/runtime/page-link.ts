import { definePlugin, useDeck } from '@deckster/engine';
import { windowKind } from '@deckster/presenter';
import { useEffect, useEffectEvent, useRef, useState } from 'react';

import type { PageGotoDone, PageGotoRequest, PageStateReport } from '#protocol/page-link-events.ts';

import {
  PAGE_GOTO_DONE_EVENT,
  PAGE_GOTO_EVENT,
  PAGE_STATE_EVENT,
} from '#protocol/page-link-events.ts';

/**
 * The longest selection a page reports, in characters.
 */
const MAX_SELECTION_CHARS = 4000;

/**
 * How long a page waits after a change before it reports, in milliseconds.
 */
const REPORT_DELAY_MS = 150;

/**
 * Gives the page a random id.
 */
function makePageId(): string {
  return `page-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/**
 * The text the user has selected, trimmed and cut.
 */
function readSelection(): string {
  return (window.getSelection()?.toString() ?? '').trim().slice(0, MAX_SELECTION_CHARS);
}

/**
 * Moves the deck to the requested slide and step, and describes where it ended up. A failure is
 * answered, not thrown, so the server hears why the move did not happen.
 *
 * @param request - The goto request.
 */
function answerGoto(request: PageGotoRequest): PageGotoDone {
  try {
    window.__deck?.goto(request.slide, request.step);
    const current = window.__deck?.position;
    const slide = current === undefined ? undefined : window.__deck?.slides[current.slide];
    return {
      request: request.request,
      ok: true,
      error: '',
      slide: slide?.id ?? request.slide,
      step: current?.step ?? request.step,
    };
  } catch (error) {
    return {
      request: request.request,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      slide: '',
      step: 0,
    };
  }
}

/**
 * Tells the dev server which slide, step and selection this page shows, and moves the page when the
 * server asks. It reports nothing and listens to nothing in `?static` mode, in the presenter window
 * and when there is no dev server, so `deckster shot`, `deckster lint`, exports and builds never
 * see it.
 *
 * @returns Nothing: it draws no element.
 */
function PageLink(): null {
  const deck = useDeck();
  const active = !deck.isStatic && windowKind() !== 'presenter' && import.meta.hot !== undefined;
  const { position } = deck;
  const [page] = useState(makePageId);
  const focusedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const report = useEffectEvent((closed: boolean) => {
    const slide = deck.slides[position.slide];
    if (slide === undefined) {
      return;
    }

    const state: PageStateReport = {
      page,
      closed,
      focusedAt: focusedAt.current,
      slide: {
        id: slide.id,
        index: slide.index,
        file: slide.file,
        layout: slide.layout,
        title: slide.title,
      },
      step: position.step,
      stepCount: slide.stepCount ?? deck.stepCount ?? 0,
      brand: deck.manifest.brand ?? '',
      selection: readSelection(),
    };
    import.meta.hot?.send(PAGE_STATE_EVENT, state);
  });

  /**
   * Reports soon, so a burst of changes sends one message.
   */
  const schedule = useEffectEvent(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => report(false), REPORT_DELAY_MS);
  });

  useEffect(() => {
    if (active) {
      schedule();
    }
  }, [active, position.slide, position.step, deck.stepCount]);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    const hot = import.meta.hot;
    if (document.hasFocus()) {
      focusedAt.current = Date.now();
    }

    /**
     * Marks this window as the one the user is in.
     */
    const focus = () => {
      focusedAt.current = Date.now();
      schedule();
    };

    /**
     * Marks the window as focused when it becomes visible.
     */
    const visible = () => {
      if (document.visibilityState === 'visible') {
        focus();
      }
    };

    /**
     * Tells the server the page is going away.
     */
    const leave = () => report(true);

    /**
     * Moves the deck as the server asked and answers.
     *
     * @param request - The goto request.
     */
    const goto = (request: PageGotoRequest) => {
      const answer = answerGoto(request);
      hot?.send(PAGE_GOTO_DONE_EVENT, answer);
      schedule();
    };

    window.addEventListener('focus', focus);
    window.addEventListener('pointerdown', focus, true);
    window.addEventListener('keydown', focus, true);
    window.addEventListener('pagehide', leave);
    document.addEventListener('visibilitychange', visible);
    document.addEventListener('selectionchange', schedule);
    hot?.on(PAGE_GOTO_EVENT, goto);
    return () => {
      clearTimeout(timer.current);
      leave();
      window.removeEventListener('focus', focus);
      window.removeEventListener('pointerdown', focus, true);
      window.removeEventListener('keydown', focus, true);
      window.removeEventListener('pagehide', leave);
      document.removeEventListener('visibilitychange', visible);
      document.removeEventListener('selectionchange', schedule);
      hot?.off(PAGE_GOTO_EVENT, goto);
    };
  }, [active]);

  return null;
}

/**
 * The page link for `deckster dev --mcp`: it reports the slide, step and selected text to the dev
 * server and applies `goto` requests from the MCP tools. Loaded only while serving with the MCP or
 * agent option.
 */
export default definePlugin({
  name: '@deckster/agent',
  overlay: PageLink,
});
