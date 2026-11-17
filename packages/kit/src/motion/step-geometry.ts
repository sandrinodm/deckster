/**
 * Where a step's content sits across its boxes, as shares of the box width from its left edge: `0`
 * is the left edge and `1` the right. A short left-aligned line in a full-width paragraph is about
 * `{ start: 0, end: 0.3 }`, a centred one about `{ start: 0.35, end: 0.65 }`.
 */
export type ContentSpan = {
  /**
   * Where the content starts, from the left edge.
   */
  start: number;

  /**
   * Where the content ends, from the left edge.
   */
  end: number;
};

/**
 * The span of a box whose content fills it, or whose content could not be measured: the effects
 * then act on the whole box.
 */
export const FULL_SPAN: ContentSpan = {
  /**
   * From the left edge.
   */
  start: 0,

  /**
   * To the right edge.
   */
  end: 1,
};

/**
 * Shares closer than this count as the same, so a re-measure that only rounds differently does not
 * re-render the step.
 */
const SPAN_TOLERANCE = 0.005;

/**
 * Elements drawn as one box even when they sit in a line, so a transform moves them as they are.
 */
const ATOMIC_ELEMENTS = new Set(['IMG', 'SVG', 'VIDEO', 'CANVAS', 'IFRAME', 'PICTURE']);

/**
 * A computed color whose alpha is 0, such as `rgba(0, 0, 0, 0)`.
 */
const TRANSPARENT_COLOR = /[,/]\s*0\)$/u;

/**
 * The sides of a box, as border properties name them.
 */
const BORDER_SIDES = ['top', 'right', 'bottom', 'left'] as const;

/**
 * A horizontal extent on screen, in any unit, as client rects give it.
 */
export type Extent = {
  /**
   * The left edge.
   */
  left: number;

  /**
   * The right edge.
   */
  right: number;
};

/**
 * The content span of one box from two extents on screen: the box's and its content's. Only their
 * ratio is used, so the canvas's scale to the window, a slide moving in, and the step's own hidden
 * `scale` or `translate` (which move both alike) all cancel out.
 *
 * @param box - The box's extent.
 * @param content - Its content's extent; an empty one (an image, nothing drawn) means the box.
 * @returns The span, kept within the box.
 */
export function spanWithin(box: Extent, content: Extent): ContentSpan {
  const width = box.right - box.left;
  if (width <= 0 || content.right <= content.left) {
    return FULL_SPAN;
  }

  const start = clampShare((content.left - box.left) / width);
  const end = clampShare((content.right - box.left) / width);
  return end > start ? { start, end } : FULL_SPAN;
}

/**
 * The span that covers every given span, so a step with several boxes moves them as one.
 *
 * @param spans - The spans of the step's boxes.
 * @returns Their union; {@link FULL_SPAN} when there are none.
 */
export function unionSpan(spans: readonly ContentSpan[]): ContentSpan {
  if (spans.length === 0) {
    return FULL_SPAN;
  }

  return {
    start: Math.min(...spans.map((span) => span.start)),
    end: Math.max(...spans.map((span) => span.end)),
  };
}

/**
 * Whether two spans are the same within rounding.
 *
 * @param first - One span.
 * @param second - The other.
 */
export function sameSpan(first: ContentSpan, second: ContentSpan): boolean {
  return (
    Math.abs(first.start - second.start) < SPAN_TOLERANCE &&
    Math.abs(first.end - second.end) < SPAN_TOLERANCE
  );
}

/**
 * Measures where the content of each element in a step sits across its box. The content is its
 * text, its pictures, and any box that paints itself (a card with a background or a border), found
 * by looking through the boxes that paint nothing, such as a list or a paragraph: a list's items
 * stretch across the measure, but their words do not. The extents are read from client rects and
 * compared only with each other (see {@link spanWithin}), the way `ownLineCount` compares line
 * positions, so nothing depends on how the canvas is scaled.
 *
 * @param step - The step's wrapper, whose element children are its boxes.
 * @returns The span covering all of them.
 */
export function measureContentSpan(step: HTMLElement): ContentSpan {
  const range = document.createRange();
  const spans = [...step.children].map((child) => {
    const box = child.getBoundingClientRect();
    if (paintsBox(child)) {
      return FULL_SPAN;
    }

    return spanWithin(box, contentExtent(child, range) ?? { left: 0, right: 0 });
  });
  return unionSpan(spans);
}

/**
 * A share kept between 0 and 1.
 *
 * @param share - The share.
 */
function clampShare(share: number): number {
  return Math.min(1, Math.max(0, share));
}

/**
 * The horizontal extent of an element's content on screen: its text, its pictures and the boxes
 * inside it that paint themselves.
 *
 * @param element - The element.
 * @param range - A range to measure text with.
 * @returns The extent; `undefined` when nothing in it is drawn.
 */
function contentExtent(element: Element, range: Range): Extent | undefined {
  let extent: Extent | undefined;
  /**
   * Widens the extent to cover another, skipping empty ones.
   *
   * @param more - An extent on screen.
   */
  const add = (more: Extent | undefined): void => {
    if (more !== undefined && more.right > more.left) {
      extent = {
        left: Math.min(extent?.left ?? more.left, more.left),
        right: Math.max(extent?.right ?? more.right, more.right),
      };
    }
  };
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '') {
      range.selectNodeContents(node);
      add(range.getBoundingClientRect());
    } else if (node instanceof Element && getComputedStyle(node).display !== 'none') {
      const drawn = ATOMIC_ELEMENTS.has(node.tagName.toUpperCase()) || paintsBox(node);
      add(drawn ? node.getBoundingClientRect() : contentExtent(node, range));
    }
  }

  return extent;
}

/**
 * Whether an element paints a box of its own (a background, a border or a shadow), so the box, not
 * only what is in it, is what the room sees arrive.
 *
 * @param element - The element.
 */
function paintsBox(element: Element): boolean {
  const style = getComputedStyle(element);
  const background = style.backgroundColor;
  // A computed color with an alpha of 0 is written `rgba(0, 0, 0, 0)` or `transparent`.
  const transparent =
    background === '' || background === 'transparent' || TRANSPARENT_COLOR.test(background);
  const bordered = BORDER_SIDES.some(
    (side) => Number.parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0,
  );
  const shadowed = style.boxShadow !== '' && style.boxShadow !== 'none';
  const pictured = style.backgroundImage !== '' && style.backgroundImage !== 'none';
  return !transparent || bordered || shadowed || pictured;
}

/**
 * Whether a step holds words inside a line rather than boxes of its own: a step written in the
 * middle of a sentence. Its wrapper must then carry the effect itself, since the words have no box
 * for the effect to act on. A step that holds only boxes that sit in a line (an icon, a chip) is
 * not one: those boxes take every effect as they are. The answer comes from computed `display`,
 * never from geometry.
 *
 * @param step - The step's wrapper.
 * @returns `true` when it holds text directly, or inline elements that are not single boxes.
 */
export function holdsInlineContent(step: HTMLElement): boolean {
  let inline = false;
  for (const node of step.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      inline ||= (node.textContent ?? '').trim() !== '';
      continue;
    }

    if (!(node instanceof Element)) {
      continue;
    }

    // An empty value is the initial one, `inline`, which some DOM implementations leave unset.
    const display = getComputedStyle(node).display || 'inline';
    if (!display.startsWith('inline')) {
      return false;
    }

    inline ||= display === 'inline' && !ATOMIC_ELEMENTS.has(node.tagName.toUpperCase());
  }

  return inline;
}
