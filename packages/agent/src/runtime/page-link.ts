import { definePlugin, useDeck } from '@deckster/engine';
import { windowKind } from '@deckster/presenter';
import { useEffect, useEffectEvent, useRef, useState } from 'react';

import type {
  PageGotoDone,
  PageGotoRequest,
  PageStateReport,
  PlacedElementReport,
} from '#protocol/page-link-events.ts';

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
 * Logical slide canvas width in canvas pixels, used when scaling DOM rects back to canvas space.
 */
const CANVAS_WIDTH_PX = 1920;

/**
 * Logical slide canvas height in canvas pixels, used when scaling DOM rects back to canvas space.
 */
const CANVAS_HEIGHT_PX = 1080;

/**
 * Attributes whose changes on the slide can alter the placed-element report.
 */
const PLACED_OBSERVED_ATTRIBUTES = [
  'data-slide-active',
  'data-placed',
  'data-placed-name',
  'data-placed-spec',
  'data-placed-zone',
  'data-placed-rect',
];

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
 * Checks whether an attribute value is one of the supported placed-element kinds.
 *
 * @param value - The raw `data-placed` attribute value.
 */
function isPlacedKind(value: string | null): value is PlacedElementReport['kind'] {
  return value === 'place' || value === 'shape' || value === 'text';
}

/**
 * Reads an element attribute, returning undefined when absent or empty.
 *
 * @param element - The DOM element to inspect.
 * @param attribute - The attribute name.
 */
function readNonEmptyAttr(element: Element, attribute: string): string | undefined {
  const value = element.getAttribute(attribute);
  return value === null || value === '' ? undefined : value;
}

/**
 * Parses a `data-placed-rect="x,y,w,h"` attribute into a 4-number canvas tuple, or returns
 * undefined when missing or malformed.
 *
 * @param raw - The raw `data-placed-rect` attribute value.
 */
function parsePlacedRect(
  raw: string | null,
): readonly [number, number, number, number] | undefined {
  if (raw === null) {
    return undefined;
  }

  const parts = raw.split(',');
  if (parts.length !== 4) {
    return undefined;
  }

  const numbers: number[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed === '') {
      return undefined;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      return undefined;
    }

    numbers.push(parsed);
  }

  return [numbers[0] ?? 0, numbers[1] ?? 0, numbers[2] ?? 0, numbers[3] ?? 0];
}

/**
 * Computes a placed element's bounding rect in 1920x1080 canvas coordinates relative to
 * `.deck-canvas` when `data-placed-rect` is missing or invalid.
 *
 * @param element - The placed DOM element.
 * @param canvas - The enclosing `.deck-canvas` element, if present.
 */
function measurePlacedRect(
  element: Element,
  canvas: Element | null,
): readonly [number, number, number, number] {
  const box = element.getBoundingClientRect();
  const canvasBox = canvas?.getBoundingClientRect();
  if (canvasBox !== undefined && canvasBox.width > 0 && canvasBox.height > 0) {
    const scaleX = CANVAS_WIDTH_PX / canvasBox.width;
    const scaleY = CANVAS_HEIGHT_PX / canvasBox.height;
    return [
      Math.round((box.left - canvasBox.left) * scaleX),
      Math.round((box.top - canvasBox.top) * scaleY),
      Math.round(box.width * scaleX),
      Math.round(box.height * scaleY),
    ];
  }

  return [Math.round(box.left), Math.round(box.top), Math.round(box.width), Math.round(box.height)];
}

/**
 * Collects all placed elements (`[data-placed]`) rendered inside the active slide section
 * (`section[data-slide-active="true"]`), preserving DOM order.
 *
 * @param root - The document or container to query; defaults to `document`.
 */
export function readPlacedElements(root: ParentNode = document): readonly PlacedElementReport[] {
  const activeSlide = root.querySelector('section[data-slide-active="true"]');
  if (activeSlide === null) {
    return [];
  }

  const canvas = activeSlide.closest('.deck-canvas') ?? root.querySelector('.deck-canvas');
  const reports: PlacedElementReport[] = [];
  for (const element of activeSlide.querySelectorAll('[data-placed]')) {
    const kind = element.getAttribute('data-placed');
    if (!isPlacedKind(kind)) {
      continue;
    }

    const name = readNonEmptyAttr(element, 'data-placed-name');
    const place = readNonEmptyAttr(element, 'data-placed-spec');
    const zone = readNonEmptyAttr(element, 'data-placed-zone');
    const rect =
      parsePlacedRect(element.getAttribute('data-placed-rect')) ??
      measurePlacedRect(element, canvas);
    reports.push({
      kind,
      ...(name !== undefined ? { name } : {}),
      ...(place !== undefined ? { place } : {}),
      ...(zone !== undefined ? { zone } : {}),
      rect,
    });
  }

  return reports;
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
  const lastPlacedKey = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const report = useEffectEvent((closed: boolean) => {
    const slide = deck.slides[position.slide];
    if (slide === undefined) {
      return;
    }

    const placed = readPlacedElements();
    lastPlacedKey.current = JSON.stringify(placed);
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
      placed,
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
  }, [active, position.slide, position.step, deck.stepCount, deck.slides]);

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

    const observeTarget = document.querySelector('.deck-canvas') ?? document.body;
    const observer =
      typeof MutationObserver === 'undefined' || observeTarget === null
        ? undefined
        : new MutationObserver(() => {
            const key = JSON.stringify(readPlacedElements());
            if (key !== lastPlacedKey.current) {
              schedule();
            }
          });
    observer?.observe(observeTarget, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: PLACED_OBSERVED_ATTRIBUTES,
    });

    return () => {
      clearTimeout(timer.current);
      observer?.disconnect();
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
