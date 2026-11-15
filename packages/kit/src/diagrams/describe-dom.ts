import type { DescribedBox, DescribedColor, DescribedText } from '#diagrams/diagram-description.ts';

import { round2 } from '#diagrams/geometry.ts';

/**
 * Colors converted so far, by CSS value.
 */
const converted = new Map<string, DescribedColor>();

/**
 * A 1x1 canvas for converting any CSS color (including `oklch()`) to hex, created on first use.
 */
let pixel: CanvasRenderingContext2D | null | undefined;

/**
 * The alpha channel of a fully opaque pixel, which the hex form leaves out.
 */
const OPAQUE_ALPHA = 255;

/**
 * Soft hyphens, which a text's hyphenation inserts and the description must not keep.
 */
const SOFT_HYPHEN_PATTERN = /­/g;

/**
 * Runs of whitespace, which the description collapses to one space.
 */
const WHITESPACE_PATTERN = /\s+/g;

/**
 * Quotes around a font family's name.
 */
const QUOTED_NAME_PATTERN = /^["']|["']$/g;

/**
 * The first letter of each word, for `text-transform: capitalize`.
 */
const WORD_START_PATTERN = /(^|\s)(\S)/g;

/**
 * Converts a computed CSS color to `#rrggbb` (or `#rrggbbaa` when translucent) by painting it on a
 * one-pixel canvas, which handles every color syntax the browser does.
 *
 * @param value - A computed color, such as `rgb(12, 34, 56)` or `oklch(0.7 0.1 40)`.
 * @returns The hex color; `null` for `none`, `transparent` and fully transparent colors.
 */
export function cssColorToHex(value: string): DescribedColor {
  const known = converted.get(value);
  if (known !== undefined) {
    return known;
  }

  const result = convert(value);
  converted.set(value, result);
  return result;
}

/**
 * The position of an element relative to an ancestor, from layout offsets (unaffected by the deck's
 * scaling). SVG elements, which have no offsets, and elements moved by their own `translate` or
 * `transform`, use their bounding box relative to the ancestor's, divided by the ancestor's scale.
 *
 * @param element - The element.
 * @param ancestor - An ancestor of it.
 */
export function offsetWithin(element: Element, ancestor: HTMLElement): DescribedBox {
  if (element instanceof HTMLElement && !isShifted(element)) {
    let x = 0;
    let y = 0;
    let current: HTMLElement | null = element;
    while (current !== null && current !== ancestor) {
      x += current.offsetLeft;
      y += current.offsetTop;
      const parent: Element | null = current.offsetParent;
      current = parent instanceof HTMLElement ? parent : null;
      if (current !== null && !ancestor.contains(current) && current !== ancestor) {
        break;
      }
    }

    return { x, y, width: element.offsetWidth, height: element.offsetHeight };
  }

  const own = element.getBoundingClientRect();
  const base = ancestor.getBoundingClientRect();
  const scale = ancestor.offsetWidth === 0 ? 1 : base.width / ancestor.offsetWidth;
  return {
    x: (own.x - base.x) / scale,
    y: (own.y - base.y) / scale,
    width: own.width / scale,
    height: own.height / scale,
  };
}

/**
 * Whether an element is moved from its layout box by its own `translate` or `transform` (a badge
 * standing on its node's corner, a label above its arrow), so its offsets do not say where it is
 * drawn.
 *
 * @param element - An HTML element.
 */
function isShifted(element: HTMLElement): boolean {
  const style = getComputedStyle(element);
  return (
    (style.translate !== '' && style.translate !== 'none') ||
    (style.transform !== '' && style.transform !== 'none')
  );
}

/**
 * Where an element sits on the 1920x1080 canvas: its offset within its slide.
 *
 * @param element - An element on a slide.
 */
export function canvasOrigin(element: HTMLElement): { x: number; y: number } {
  const slide = element.closest<HTMLElement>('.deck-slide');
  if (slide === null) {
    return { x: 0, y: 0 };
  }

  const box = offsetWithin(element, slide);
  return { x: box.x, y: box.y };
}

/**
 * Describes a text element: its string, its box on the canvas and its type.
 *
 * @param element - The element that holds the text.
 * @param root - The diagram's root.
 * @param origin - The root's place on the canvas.
 * @returns The text; `null` for no element or an empty one.
 */
export function describeText(
  element: Element | null,
  root: HTMLElement,
  origin: { x: number; y: number },
): DescribedText | null {
  if (element === null) {
    return null;
  }

  const style = getComputedStyle(element);
  const plain = (element.textContent ?? '')
    .replace(SOFT_HYPHEN_PATTERN, '')
    .replace(WHITESPACE_PATTERN, ' ')
    .trim();
  const text = transformed(plain, style);
  if (text === '') {
    return null;
  }

  const box = offsetWithin(element, root);
  return {
    text,
    box: shiftBox(box, origin),
    color: cssColorToHex(style.color),
    fontFamily: primaryFontFamily(style),
    fontSizePx: Number.parseFloat(style.fontSize),
    fontWeight: Number.parseFloat(style.fontWeight),
    align: textAlign(style.textAlign),
    opacity: opacityWithin(element, root),
  };
}

/**
 * The first family of an element's font stack, unquoted: the name the brand's font is known by.
 *
 * @param style - The element's computed style.
 */
export function primaryFontFamily(style: CSSStyleDeclaration): string {
  return (style.fontFamily.split(',')[0] ?? '').trim().replace(QUOTED_NAME_PATTERN, '');
}

/**
 * Text as a `text-transform` sets it. Read from `textContent` rather than `innerText`, so text on a
 * slide that is hidden (not on screen yet) or fading in is described in full.
 *
 * @param text - The text as written.
 * @param style - The element's computed style.
 */
function transformed(text: string, style: CSSStyleDeclaration): string {
  switch (style.textTransform) {
    case 'uppercase':
      return text.toUpperCase();
    case 'lowercase':
      return text.toLowerCase();
    case 'capitalize':
      return text.replace(
        WORD_START_PATTERN,
        (_, space: string, letter: string) => space + letter.toUpperCase(),
      );
    default:
      return text;
  }
}

/**
 * A box moved by an offset, rounded to two decimals.
 *
 * @param box - The box.
 * @param by - The offset.
 */
export function shiftBox(box: DescribedBox, by: { x: number; y: number }): DescribedBox {
  return {
    x: round2(box.x + by.x),
    y: round2(box.y + by.y),
    width: round2(box.width),
    height: round2(box.height),
  };
}

/**
 * The effective opacity of an element: its own times its ancestors' up to the diagram's root.
 *
 * @param element - The element.
 * @param root - The diagram's root.
 */
export function opacityWithin(element: Element, root: HTMLElement): number {
  let opacity = 1;
  let current: Element | null = element;
  while (current !== null && current !== root.parentElement) {
    opacity *= Number.parseFloat(getComputedStyle(current).opacity) || 0;
    current = current.parentElement;
  }

  return round2(opacity);
}

/**
 * An icon's markup as a standalone SVG document with its color resolved.
 *
 * @param svg - The icon's element.
 * @param color - The color `currentColor` stands for.
 */
export function iconMarkup(svg: SVGSVGElement, color: DescribedColor): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.removeAttribute('class');
  clone.removeAttribute('aria-hidden');
  clone.removeAttribute('focusable');
  return clone.outerHTML.replaceAll('currentColor', color ?? '#000000');
}

/**
 * Paints a color on the one-pixel canvas and reads it back.
 *
 * @param value - A CSS color.
 */
function convert(value: string): DescribedColor {
  if (value === '' || value === 'none' || value === 'transparent') {
    return null;
  }

  pixel ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (pixel === null) {
    return null;
  }

  pixel.clearRect(0, 0, 1, 1);
  pixel.fillStyle = '#000000';
  pixel.fillStyle = value;
  pixel.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0, a = 0] = pixel.getImageData(0, 0, 1, 1).data;
  if (a === 0) {
    return null;
  }

  const hex = [r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('');
  return a === OPAQUE_ALPHA ? `#${hex}` : `#${hex}${a.toString(16).padStart(2, '0')}`;
}

/**
 * A computed `text-align` as the description names it.
 *
 * @param value - The computed value.
 */
function textAlign(value: string): DescribedText['align'] {
  if (value === 'center') {
    return 'center';
  }

  return value === 'right' || value === 'end' ? 'right' : 'left';
}
