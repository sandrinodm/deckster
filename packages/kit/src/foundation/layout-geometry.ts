/**
 * Extra canvas pixels a measurement may be off by before it counts; absorbs sub-pixel rounding.
 */
export const MEASURE_TOLERANCE_PX = 1;

/**
 * Lines whose tops are within this fraction of a line height of each other count as one line.
 */
const SAME_LINE_FRACTION = 0.5;

/**
 * Whether a box's in-flow content reaches past its content box at the bottom. Content is measured
 * by layout offsets, which ignore transforms: an element rising into place during the slide
 * entrance, or a slide sliding in, does not make its box count as full. Glyphs that reach past a
 * tight line height do not count either, since only element boxes are measured.
 *
 * @param box - The box, such as the safe area of a slide.
 * @returns `true` when the last in-flow element ends below the box's content edge.
 */
export function overflowsBottom(box: HTMLElement): boolean {
  const style = getComputedStyle(box);
  const contentHeight = box.clientHeight - Number.parseFloat(style.paddingBottom || '0');
  return contentBottom(box) > contentHeight + MEASURE_TOLERANCE_PX;
}

/**
 * How far down a box its in-flow children reach, in canvas pixels from the top of its padding box.
 * Elements with `display: contents` (slot and step wrappers) are looked through; absolutely
 * positioned decoration and hidden elements are skipped.
 *
 * @param box - The box.
 */
export function contentBottom(box: HTMLElement): number {
  let bottom = 0;
  for (const child of inFlowChildren(box)) {
    bottom = Math.max(bottom, offsetTopWithin(child, box) + child.offsetHeight);
  }

  return bottom;
}

/**
 * The distance from the top of an ancestor's padding box to the top of an element's border box,
 * from layout offsets: transforms on either or on anything between them are ignored.
 *
 * @param element - The element.
 * @param ancestor - One of its ancestors.
 */
export function offsetTopWithin(element: HTMLElement, ancestor: HTMLElement): number {
  return documentTop(element) - documentTop(ancestor) - ancestor.clientTop;
}

/**
 * How many lines an element's own text takes: distinct line positions of its text, not counting
 * text inside nested lists, which count as their own items.
 *
 * @param element - A paragraph, list item or heading.
 */
export function ownLineCount(element: HTMLElement): number {
  const lineHeight = lineHeightOf(element);
  const tops: number[] = [];
  const range = document.createRange();
  const item = element.tagName === 'LI' ? element : null;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      item === null || node.parentElement?.closest('li') === item
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT,
  });
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node.textContent?.trim() === '') {
      continue;
    }

    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) {
      tops.push(rect.top);
    }
  }

  // Client rects are on screen, scaled with the canvas; compare them at the same scale.
  const scale = screenScale(element);
  const tolerance = lineHeight * scale * SAME_LINE_FRACTION;
  const lines: number[] = [];
  for (const top of tops.toSorted((first, second) => first - second)) {
    const last = lines.at(-1);
    if (last === undefined || top - last > tolerance) {
      lines.push(top);
    }
  }

  return lines.length;
}

/**
 * The element's computed line height in canvas pixels, or its font size for `normal`.
 *
 * @param element - A text element.
 */
export function lineHeightOf(element: HTMLElement): number {
  const style = getComputedStyle(element);
  const height = Number.parseFloat(style.lineHeight);
  return Number.isFinite(height) && height > 0 ? height : Number.parseFloat(style.fontSize);
}

/**
 * The element's in-flow children, looking through `display: contents` wrappers.
 *
 * @param box - The parent.
 */
function inFlowChildren(box: Element): HTMLElement[] {
  const found: HTMLElement[] = [];
  for (const child of box.children) {
    if (!(child instanceof HTMLElement)) {
      continue;
    }

    const style = getComputedStyle(child);
    if (style.display === 'contents') {
      pushAll(found, inFlowChildren(child));
    } else if (
      style.display !== 'none' &&
      style.position !== 'absolute' &&
      style.position !== 'fixed'
    ) {
      found.push(child);
    }
  }

  return found;
}

/**
 * The element's top in its document from layout offsets, through its chain of offset parents.
 *
 * @param element - Any element.
 */
function documentTop(element: HTMLElement): number {
  let top = 0;
  let node: HTMLElement | null = element;
  while (node !== null) {
    top += node.offsetTop;
    const parent: Element | null = node.offsetParent;
    if (!(parent instanceof HTMLElement)) {
      break;
    }

    top += parent.clientTop;
    node = parent;
  }

  return top;
}

/**
 * How much larger the element appears on screen than its layout size: the canvas's scale to the
 * window, and any scale on the way.
 *
 * @param element - Any element with a box.
 */
function screenScale(element: HTMLElement): number {
  const height = element.offsetHeight;
  return height === 0 ? 1 : element.getBoundingClientRect().height / height;
}
import { pushAll } from '#foundation/lists.ts';
