import type { Rect } from '#model/comment-schema.ts';
import type { Target } from '#overlay/comments-state.ts';

import { SOURCE_ATTRIBUTE } from '#model/source-stamp.ts';

/**
 * The prefix of the property React DOM puts each element's fiber under in development.
 */
const FIBER_KEY_PREFIX = '__reactFiber$';

/**
 * The slide on screen in the main stage, not a thumbnail.
 */
const ACTIVE_SLIDE_SELECTOR = '.deck-main .deck-slide[data-slide-active="true"]';

/**
 * The scaled canvas of the main stage.
 */
const MAIN_CANVAS_SELECTOR = '.deck-main .deck-canvas';

/**
 * What the canvas holds besides slides: the brand chrome (logo, footer, page number) that plugins
 * draw over every slide. It takes no pointer events, so it is hit-tested by its boxes.
 */
const CHROME_ROOT_SELECTOR = `${MAIN_CANVAS_SELECTOR} > :not(.deck-slide)`;

/**
 * The elements of the chrome worth commenting on: images, icons, and text.
 */
const CHROME_ITEM_SELECTOR = 'img, svg, span, p, a, div';

/**
 * The longest element text an anchor keeps, in characters.
 */
const EXCERPT_LENGTH = 160;

/**
 * The share of an element's area that must lie inside a dragged region for the region to be about
 * that element.
 */
const REGION_COVER_RATIO = 0.9;

/**
 * The logical canvas width, in canvas pixels.
 */
const CANVAS_WIDTH = 1920;

/**
 * Canvas rectangles are rounded to tenths of a pixel, so stored boxes stay short.
 */
const TENTHS = 10;

/**
 * Matches a run of whitespace.
 */
const WHITESPACE_PATTERN = /\s+/g;

/**
 * The parts of a React fiber the overlay reads: the element's props and its parent.
 */
type FiberLike = {
  /**
   * The props the element rendered with.
   */
  memoizedProps?: unknown;

  /**
   * The parent fiber, `null` at the root.
   */
  return?: FiberLike | null;
};

/**
 * Where the main canvas is on screen.
 */
export type CanvasGeometry = {
  /**
   * The canvas's box in viewport pixels.
   */
  canvas: DOMRect;

  /**
   * The stage around it, which the capture layer covers.
   */
  stage: DOMRect;

  /**
   * Viewport pixels per canvas pixel.
   */
  scale: number;
};

/**
 * The slide on screen, or `null` before the deck renders.
 */
export function activeSlide(): HTMLElement | null {
  return document.querySelector<HTMLElement>(ACTIVE_SLIDE_SELECTOR);
}

/**
 * Where the main canvas is now, or `undefined` before it renders.
 */
export function readGeometry(): CanvasGeometry | undefined {
  const canvas = document.querySelector(MAIN_CANVAS_SELECTOR);
  const stage = canvas?.parentElement;
  if (canvas === null || stage === null || stage === undefined) {
    return undefined;
  }

  const box = canvas.getBoundingClientRect();
  return { canvas: box, stage: stage.getBoundingClientRect(), scale: box.width / CANVAS_WIDTH };
}

/**
 * The source stamp an element resolves to: its own `data-deck-source`, else the nearest stamp up
 * React's fiber tree. A component written in the deck carries its stamp as a prop even when it does
 * not pass it on to the DOM, so an element a kit component renders resolves to the place the slide
 * used that component.
 *
 * @param element - An element on the slide.
 * @returns The stamp, or `undefined` for an element only the layout or the engine renders.
 */
export function stampOf(element: Element): string | undefined {
  const own = element.getAttribute(SOURCE_ATTRIBUTE);
  if (own !== null) {
    return own;
  }

  for (let fiber = fiberOf(element); fiber !== undefined; fiber = fiber.return ?? undefined) {
    const props = fiber.memoizedProps;
    const stamp: unknown =
      typeof props === 'object' && props !== null
        ? Reflect.get(props, SOURCE_ATTRIBUTE)
        : undefined;
    if (typeof stamp === 'string') {
      return stamp;
    }
  }

  return undefined;
}

/**
 * The commentable element at a point of the slide on screen: the element under the point, widened
 * to the outermost DOM element of the same JSX element.
 *
 * @param x - The viewport x.
 * @param y - The viewport y.
 * @returns The target, or `undefined` when the point is not on the slide.
 */
export function targetAt(x: number, y: number): Target | undefined {
  const chrome = chromeAt(x, y);
  if (chrome !== undefined) {
    return chrome;
  }

  const slide = activeSlide();
  const hit = document
    .elementsFromPoint(x, y)
    .find((element) => slide !== null && element !== slide && slide.contains(element));
  return hit === undefined ? undefined : widen(hit);
}

/**
 * The brand chrome item at a point, such as the logo or the page number: the smallest visible
 * image, icon or text element of the chrome whose box holds the point.
 *
 * @param x - The viewport x.
 * @param y - The viewport y.
 * @returns A target marked `chrome`, or `undefined` when the point is not on the chrome.
 */
export function chromeAt(x: number, y: number): Target | undefined {
  let best: { element: Element; area: number } | undefined;
  for (const root of document.querySelectorAll(CHROME_ROOT_SELECTOR)) {
    for (const element of root.querySelectorAll(CHROME_ITEM_SELECTOR)) {
      const box = element.getBoundingClientRect();
      const area = box.width * box.height;
      const holds = x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
      if (!holds) {
        continue;
      }

      if (area === 0 || !isChromeItem(element) || !isShown(element)) {
        continue;
      }

      if (best === undefined || area < best.area) {
        best = { element, area };
      }
    }
  }

  if (best === undefined) {
    return undefined;
  }

  return { element: best.element, stamp: undefined, chrome: true };
}

/**
 * The stamped elements of the slide on screen that can be commented on, in document order, each
 * widened to the outermost element of its JSX element: what Tab walks through in comment mode.
 */
export function slideTargets(): Target[] {
  const slide = activeSlide();
  const targets: Target[] = [];
  const seen = new Set<Element>();
  for (const element of slide?.querySelectorAll(`[${SOURCE_ATTRIBUTE}]`) ?? []) {
    const target = widen(element);
    if (!seen.has(target.element) && isVisible(target.element)) {
      seen.add(target.element);
      targets.push(target);
    }
  }

  return targets;
}

/**
 * The next element up that comes from another JSX element.
 *
 * @param target - The current target.
 * @returns The parent target, or `undefined` at the slide.
 */
export function parentTarget(target: Target): Target | undefined {
  const slide = activeSlide();
  for (
    let element = target.element.parentElement;
    element !== null;
    element = element.parentElement
  ) {
    if (element === slide || slide === null || !slide.contains(element)) {
      return undefined;
    }

    const stamp = stampOf(element);
    if (stamp !== target.stamp && isVisible(element)) {
      return widen(element);
    }
  }

  return undefined;
}

/**
 * The first visible element below a target that comes from another JSX element, in document order.
 *
 * @param target - The current target.
 * @returns The child target, or `undefined` when there is none.
 */
export function childTarget(target: Target): Target | undefined {
  for (const element of target.element.querySelectorAll('*')) {
    if (stampOf(element) !== target.stamp && isVisible(element)) {
      return widen(element);
    }
  }

  return undefined;
}

/**
 * The stamped element a dragged region is about: the first, in document order, that lies almost
 * wholly inside it.
 *
 * @param region - The region in viewport pixels.
 */
export function targetInRegion(region: DOMRect): Target | undefined {
  const slide = activeSlide();
  const candidates = slide?.querySelectorAll(`[${SOURCE_ATTRIBUTE}]`) ?? [];
  for (const element of candidates) {
    const box = element.getBoundingClientRect();
    const area = box.width * box.height;
    if (area > 0 && overlapArea(box, region) >= area * REGION_COVER_RATIO) {
      return widen(element);
    }
  }

  return undefined;
}

/**
 * Finds the element a stamp names on the slide on screen: an element carrying it, else one stamped
 * on the same line, else one whose fiber resolves to it.
 *
 * @param stamp - `file:line:column`.
 * @returns The outermost element of it, or `undefined`.
 */
export function elementForStamp(stamp: string): Element | undefined {
  const slide = activeSlide();
  if (slide === null) {
    return undefined;
  }

  const exact = slide.querySelector(`[${SOURCE_ATTRIBUTE}="${CSS.escape(stamp)}"]`);
  if (exact !== null) {
    return widen(exact).element;
  }

  const line = stamp.slice(0, stamp.lastIndexOf(':') + 1);
  const sameLine = slide.querySelector(`[${SOURCE_ATTRIBUTE}^="${CSS.escape(line)}"]`);
  if (sameLine !== null) {
    return widen(sameLine).element;
  }

  const resolved = [...slide.querySelectorAll('*')].find((element) => stampOf(element) === stamp);
  return resolved === undefined ? undefined : widen(resolved).element;
}

/**
 * A CSS path from the slide's `<section>` to an element, by tag and position among siblings of the
 * same tag, such as `section[data-slide-id="intro"] > div:nth-of-type(1) > h2:nth-of-type(1)`.
 *
 * @param element - An element on the slide.
 */
export function cssPathOf(element: Element): string {
  const parts: string[] = [];
  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    if (node.matches('section.deck-slide')) {
      parts.unshift(`section[data-slide-id="${node.getAttribute('data-slide-id') ?? ''}"]`);
      break;
    }

    if (node.matches('.deck-canvas')) {
      parts.unshift('.deck-canvas');
      break;
    }

    const tag = node.tagName.toLowerCase();
    const sameTag = [...(node.parentElement?.children ?? [])].filter(
      (sibling) => sibling.tagName === node?.tagName,
    );
    parts.unshift(`${tag}:nth-of-type(${sameTag.indexOf(node) + 1})`);
  }

  return parts.join(' > ');
}

/**
 * The start of an element's text, whitespace collapsed.
 *
 * @param element - Any element.
 */
export function textExcerpt(element: Element): string {
  return (element.textContent ?? '')
    .replaceAll(WHITESPACE_PATTERN, ' ')
    .trim()
    .slice(0, EXCERPT_LENGTH);
}

/**
 * A viewport box in canvas pixels, rounded to tenths.
 *
 * @param box - A box from `getBoundingClientRect`.
 * @param geometry - Where the canvas is.
 */
export function toCanvasRect(box: DOMRect, geometry: CanvasGeometry): Rect {
  /**
   * Rounds to tenths of a canvas pixel.
   */
  const round = (value: number) => Math.round(value * TENTHS) / TENTHS;
  return {
    x: round((box.left - geometry.canvas.left) / geometry.scale),
    y: round((box.top - geometry.canvas.top) / geometry.scale),
    width: round(box.width / geometry.scale),
    height: round(box.height / geometry.scale),
  };
}

/**
 * A canvas rectangle in viewport pixels.
 *
 * @param rect - A rectangle in canvas pixels.
 * @param geometry - Where the canvas is.
 */
export function toViewportRect(rect: Rect, geometry: CanvasGeometry): DOMRect {
  return new DOMRect(
    geometry.canvas.left + rect.x * geometry.scale,
    geometry.canvas.top + rect.y * geometry.scale,
    rect.width * geometry.scale,
    rect.height * geometry.scale,
  );
}

/**
 * The element's fiber, or `undefined` outside React's development build.
 *
 * @param element - A DOM element.
 */
function fiberOf(element: Element): FiberLike | undefined {
  const key = Object.keys(element).find((candidate) => candidate.startsWith(FIBER_KEY_PREFIX));
  const fiber: unknown = key === undefined ? undefined : Reflect.get(element, key);
  return typeof fiber === 'object' && fiber !== null ? (fiber as FiberLike) : undefined;
}

/**
 * Widens an element to the outermost ancestor that resolves to the same stamp, inside the slide: a
 * component's outer element instead of the inner one the pointer is on.
 *
 * @param element - An element on the slide.
 */
function widen(element: Element): Target {
  const stamp = stampOf(element);
  const slide = activeSlide();
  let outer = element;
  for (
    let parent = element.parentElement;
    parent !== null && parent !== slide;
    parent = parent.parentElement
  ) {
    if (stamp === undefined || stampOf(parent) !== stamp) {
      break;
    }

    outer = parent;
  }

  return { element: outer, stamp };
}

/**
 * Whether a chrome element is an item rather than a box around items: an image, an icon, or an
 * element with text of its own. Parts of an icon count as the icon.
 *
 * @param element - An element of the chrome.
 */
function isChromeItem(element: Element): boolean {
  const tag = element.tagName.toLowerCase();
  if (tag === 'img' || tag === 'svg') {
    return true;
  }

  return [...element.childNodes].some(
    (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '',
  );
}

/**
 * Whether an element is drawn: not hidden, not faded out (chrome a title slide hides is only made
 * transparent), and inside a layer that is not leaving.
 *
 * @param element - Any element.
 */
function isShown(element: Element): boolean {
  if (element.closest('[data-leaving="true"], [data-visible="false"]') !== null) {
    return false;
  }

  return typeof element.checkVisibility === 'function'
    ? element.checkVisibility({ opacityProperty: true, visibilityProperty: true })
    : true;
}

/**
 * Whether an element takes up space on screen.
 *
 * @param element - Any element.
 */
function isVisible(element: Element): boolean {
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0;
}

/**
 * The area two boxes share.
 *
 * @param a - One box.
 * @param b - The other.
 */
function overlapArea(a: DOMRect, b: DOMRect): number {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return Math.max(0, width) * Math.max(0, height);
}
