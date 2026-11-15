import type { SceneRect } from '#scene/scene.ts';
import type { PathCommand } from '#vector/svg-path.ts';

import { elementPath } from '#vector/svg-path.ts';

/**
 * Matches an element's start or end tag in serialised SVG markup.
 */
const TAG_PATTERN = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s=/>]+="[^"]*")*)\s*(\/?)>/g;

/**
 * Matches one attribute.
 */
const ATTRIBUTE_PATTERN = /([^\s=/>]+)="([^"]*)"/g;

/**
 * Matches `rgb()` and `rgba()` colors as computed styles write them.
 */
const RGB_PATTERN =
  /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/;

/**
 * Matches `#rgb`, `#rrggbb` and `#rrggbbaa`.
 */
const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * Matches a number in a length or list.
 */
const NUMBER_PATTERN = /-?[\d.]+(?:e[+-]?\d+)?/gi;

/**
 * Matches a `tspan`, capturing its content. Read with `matchAll`, which never moves the pattern's
 * own position.
 */
const TSPAN_PATTERN = /<tspan\b[^>]*>([\s\S]*?)<\/tspan>/g;

/**
 * Matches the `dy` of a `tspan`, capturing its value. Read with `matchAll`.
 */
const TSPAN_DY_PATTERN = /<tspan\b[^>]*\bdy="([^"]*)"/g;

/**
 * Matches a run of whitespace, which a text line collapses to one space.
 */
const WHITESPACE_RUN = /\s+/g;

/**
 * Matches any single character, which a hex color's shorthand doubles.
 */
const ANY_CHARACTER = /./g;

/**
 * Matches a quote at either end of a font family name.
 */
const FAMILY_QUOTES = /^["']|["']$/g;

/**
 * Matches a tag in markup.
 */
const MARKUP_TAG = /<[^>]*>/g;

/**
 * Matches a hexadecimal character reference such as `&#x2014;`.
 */
const HEX_REFERENCE = /&#x([0-9a-f]+);/gi;

/**
 * Matches a decimal character reference such as `&#8212;`.
 */
const DECIMAL_REFERENCE = /&#(\d+);/g;

/**
 * The drawable elements read as geometry.
 */
const SHAPE_TAGS = new Set(['path', 'line', 'circle', 'ellipse', 'rect', 'polyline', 'polygon']);

/**
 * The full value of an 8-bit channel.
 */
const CHANNEL_MAX = 255;

/**
 * Hex digits per channel.
 */
const HEX_RADIX = 16;

/**
 * The class kit charts put on data marks: bars, lines, areas, dots and slices.
 */
const MARK_CLASS = 'kit-chart-mark';

/**
 * The prefix of the kit's type-step classes, such as `kit-type-caption`.
 */
const TYPE_STEP_PREFIX = 'kit-type-';

/**
 * The line height of a chart text line when the markup does not say, as a share of its size.
 */
const DEFAULT_LINE_HEIGHT = 1.2;

/**
 * The font size a chart text takes when the markup does not say, in user units.
 */
const DEFAULT_FONT_SIZE = 16;

/**
 * The numeric weight of bold text.
 */
const BOLD_WEIGHT = 700;

/**
 * The numeric weight of text that is not bold.
 */
const NORMAL_WEIGHT = 400;

/**
 * How many percent make a whole, for an alpha written as a percentage.
 */
const PERCENT = 100;

/**
 * A view box in the SVG's user units.
 */
type ViewBox = {
  /**
   * The left edge.
   */
  x: number;

  /**
   * The top edge.
   */
  y: number;

  /**
   * The width.
   */
  width: number;

  /**
   * The height.
   */
  height: number;
};

/**
 * A text element whose start tag has been read and whose end tag has not yet come.
 */
type OpenText = {
  /**
   * The start tag's attributes.
   */
  attrs: Record<string, string>;

  /**
   * The start tag's inline style.
   */
  style: Record<string, string>;

  /**
   * Where the text's content starts in the markup.
   */
  start: number;
};

/**
 * What reading a chart's markup has collected so far.
 */
type ReadState = {
  /**
   * The elements read, in paint order.
   */
  items: ChartSvgItem[];

  /**
   * The opacity of each open group, the outermost first; the last one applies to the next element.
   */
  opacities: number[];

  /**
   * The view box of the innermost `svg`, or `null` before one is read.
   */
  viewBox: ViewBox | null;

  /**
   * The text element still open, if any.
   */
  openText: OpenText | null;

  /**
   * Where the SVG sits on the slide.
   */
  rect: SceneRect;
};

/**
 * Text drawn in a chart's SVG.
 */
export type ChartSvgText = {
  /**
   * The lines, top to bottom.
   */
  lines: string[];

  /**
   * The anchor point's x in canvas pixels.
   */
  x: number;

  /**
   * The anchor point's y in canvas pixels: the middle of the first line (kit charts set
   * `dominant-baseline: central`).
   */
  y: number;

  /**
   * Where the anchor sits on the line.
   */
  anchor: 'start' | 'middle' | 'end';

  /**
   * The font size in canvas pixels.
   */
  size: number;

  /**
   * The distance between lines in canvas pixels.
   */
  lineHeight: number;

  /**
   * The first family of the computed font stack.
   */
  family: string;

  /**
   * The numeric weight.
   */
  weight: number;

  /**
   * The color as `#rrggbb` or `#rrggbbaa`.
   */
  color: string;

  /**
   * The kit type step (`caption`, `small`, ...) from its class, or `null`.
   */
  step: string | null;
};

/**
 * One element of a chart's SVG, in canvas pixels.
 */
export type ChartSvgItem = {
  /**
   * The element's position in the markup.
   */
  index: number;

  /**
   * The tag: `path`, `line`, `circle`, `rect`, `text`, ...
   */
  tag: string;

  /**
   * Whether the kit marks it as data (`kit-chart-mark`).
   */
  mark: boolean;

  /**
   * The geometry attributes as written.
   */
  attrs: Record<string, string>;

  /**
   * The outline in canvas pixels; empty for text.
   */
  commands: PathCommand[];

  /**
   * The fill with its opacity applied, or `null` for none.
   */
  fill: string | null;

  /**
   * The stroke with its opacity applied, or `null` for none.
   */
  stroke: string | null;

  /**
   * The stroke width in canvas pixels.
   */
  strokeWidth: number;

  /**
   * The dash pattern in canvas pixels, or `null` for a solid line (including the kit's drawable `1
   * 1` pattern on a unit `pathLength`, which shows a whole line).
   */
  dash: number[] | null;

  /**
   * The line cap.
   */
  cap: 'butt' | 'round' | 'square';

  /**
   * The text, for `text` elements.
   */
  text: ChartSvgText | null;
};

/**
 * A chart's SVG read back from its markup.
 */
export type ChartSvg = {
  /**
   * Where the SVG sits on the slide.
   */
  rect: SceneRect;

  /**
   * Its elements in paint order.
   */
  items: ChartSvgItem[];

  /**
   * How user units map to canvas pixels: `rect.x + (u - view.x) * view.scale`.
   */
  view: { x: number; y: number; scale: number };
};

/**
 * Reads the serialised SVG of a kit chart's plot (computed colors and fonts inlined as styles by
 * the scene collector) into elements in canvas pixels: geometry, paint, dash, text with its font,
 * and whether the element is a data mark. Group opacity is applied to children.
 *
 * @param markup - The standalone SVG markup.
 * @param rect - Where the SVG sits on the slide.
 * @returns The elements; markup it cannot read yields fewer items, never an error.
 */
export function readChartSvg(markup: string, rect: SceneRect): ChartSvg {
  const state: ReadState = { items: [], opacities: [1], viewBox: null, openText: null, rect };
  TAG_PATTERN.lastIndex = 0;
  for (let match = TAG_PATTERN.exec(markup); match !== null; match = TAG_PATTERN.exec(markup)) {
    if (match[1] === '/') {
      closeTag(state, markup, match);
    } else {
      openTag(state, match);
    }
  }

  const box = state.viewBox ?? { x: 0, y: 0, width: rect.width, height: rect.height };
  return {
    rect,
    items: state.items,
    view: { x: box.x, y: box.y, scale: rect.width / box.width },
  };
}

/**
 * Handles an end tag: a finished text becomes an item, and a finished group or `svg` gives back its
 * opacity.
 *
 * @param state - What has been read so far.
 * @param markup - The whole markup, to read a text's content from.
 * @param match - The end tag's match.
 */
function closeTag(state: ReadState, markup: string, match: RegExpExecArray): void {
  const tag = (match[2] ?? '').toLowerCase();
  if (tag === 'text' && state.openText !== null) {
    const content = markup.slice(state.openText.start, match.index);
    const item = textItem(
      state.items.length,
      state.openText,
      content,
      state.opacities.at(-1) ?? 1,
      state.rect,
      state.viewBox,
    );
    if (item !== null) {
      state.items.push(item);
    }

    state.openText = null;
    return;
  }

  if (tag === 'g' || tag === 'svg') {
    state.opacities.pop();
  }
}

/**
 * Handles a start tag: an `svg` sets the view box, a group or `svg` adds its opacity, a `text`
 * opens, and a drawable element becomes an item unless a text is open.
 *
 * @param state - What has been read so far.
 * @param match - The start tag's match.
 */
function openTag(state: ReadState, match: RegExpExecArray): void {
  const tag = (match[2] ?? '').toLowerCase();
  const selfClosing = match[4] === '/';
  const attributes = readAttributes(match[3] ?? '');
  const style = readStyle(attributes['style'] ?? '');
  const ownOpacity = numberOr(style['opacity'] ?? attributes['opacity'], 1);
  if (tag === 'svg') {
    state.viewBox = readViewBox(attributes['viewBox'], state.rect);
    state.opacities.push((state.opacities.at(-1) ?? 1) * ownOpacity);
    return;
  }

  if (tag === 'g') {
    if (!selfClosing) {
      state.opacities.push((state.opacities.at(-1) ?? 1) * ownOpacity);
    }

    return;
  }

  if (tag === 'text') {
    state.openText = { attrs: attributes, style, start: match.index + match[0].length };
    return;
  }

  if (state.openText !== null || !SHAPE_TAGS.has(tag)) {
    return;
  }

  const item = shapeItem(
    state.items.length,
    tag,
    attributes,
    style,
    (state.opacities.at(-1) ?? 1) * ownOpacity,
    state.rect,
    state.viewBox,
  );
  if (item !== null) {
    state.items.push(item);
  }
}

/**
 * The view box, or the SVG's own size when it has none.
 *
 * @param value - The `viewBox` attribute.
 * @param rect - The SVG's box on the slide.
 */
function readViewBox(value: string | undefined, rect: SceneRect): ViewBox {
  const numbers = (value ?? '').match(NUMBER_PATTERN)?.map(Number) ?? [];
  const [x = 0, y = 0, width = rect.width, height = rect.height] = numbers;
  return { x, y, width: width || rect.width, height: height || rect.height };
}

/**
 * Maps a point in the SVG's user units to canvas pixels.
 *
 * @param rect - The SVG's box on the slide.
 * @param viewBox - Its view box.
 */
function mapper(
  rect: SceneRect,
  viewBox: ViewBox | null,
): { x: (value: number) => number; y: (value: number) => number; scale: number } {
  const box = viewBox ?? { x: 0, y: 0, width: rect.width, height: rect.height };
  const scaleX = rect.width / box.width;
  const scaleY = rect.height / box.height;
  return {
    x: (value) => rect.x + (value - box.x) * scaleX,
    y: (value) => rect.y + (value - box.y) * scaleY,
    scale: (scaleX + scaleY) / 2,
  };
}

/**
 * A drawable element.
 *
 * @param index - Its position.
 * @param tag - The tag.
 * @param attributes - Its attributes.
 * @param style - Its inline style.
 * @param opacity - Its opacity with its groups'.
 * @param rect - The SVG's box.
 * @param viewBox - The SVG's view box.
 */
function shapeItem(
  index: number,
  tag: string,
  attributes: Record<string, string>,
  style: Record<string, string>,
  opacity: number,
  rect: SceneRect,
  viewBox: ViewBox | null,
): ChartSvgItem | null {
  const map = mapper(rect, viewBox);
  const raw = elementPath({ tag, attrs: attributes });
  if (raw.length === 0) {
    return null;
  }

  // The spread loses the pairing of a command's kind with its point count, which the assertion
  // restores: every command keeps its own kind and count, only its points move.
  const commands = raw.map(
    (command) =>
      ({
        ...command,
        points: command.points.map((point) => ({ x: map.x(point.x), y: map.y(point.y) })),
      }) as PathCommand,
  );
  const fillOpacity = numberOr(style['fill-opacity'] ?? attributes['fill-opacity'], 1);
  const strokeOpacity = numberOr(style['stroke-opacity'] ?? attributes['stroke-opacity'], 1);
  const fill = paint(style['fill'] ?? attributes['fill'] ?? '#000000', opacity * fillOpacity);
  const stroke = paint(style['stroke'] ?? attributes['stroke'] ?? 'none', opacity * strokeOpacity);
  const strokeWidth = numberOr(style['stroke-width'] ?? attributes['stroke-width'], 1) * map.scale;
  return {
    index,
    tag,
    mark: (attributes['class'] ?? '').split(WHITESPACE_RUN).includes(MARK_CLASS),
    attrs: attributes,
    commands,
    fill: tag === 'line' ? null : fill,
    stroke: strokeWidth > 0 ? stroke : null,
    strokeWidth,
    dash: dashOf(attributes, style, map.scale),
    cap: capOf(style['stroke-linecap'] ?? attributes['stroke-linecap']),
    text: null,
  };
}

/**
 * A text element with its lines.
 *
 * @param index - Its position.
 * @param open - The start tag's attributes and style.
 * @param open.attrs - The attributes.
 * @param open.style - The inline style.
 * @param content - The markup between the start and end tags.
 * @param opacity - The opacity of its groups.
 * @param rect - The SVG's box.
 * @param viewBox - The SVG's view box.
 */
function textItem(
  index: number,
  open: { attrs: Record<string, string>; style: Record<string, string> },
  content: string,
  opacity: number,
  rect: SceneRect,
  viewBox: ViewBox | null,
): ChartSvgItem | null {
  const lines = textLinesOf(content);
  if (lines.length === 0) {
    return null;
  }

  const map = mapper(rect, viewBox);
  const { attrs: attributes, style } = open;
  const size =
    numberOr(style['font-size'] ?? attributes['font-size'], DEFAULT_FONT_SIZE) * map.scale;
  const offsets = [...content.matchAll(TSPAN_DY_PATTERN)].map((match) =>
    Number.parseFloat(match[1] ?? '0'),
  );
  const step = offsets.find((value) => value > 0);
  const anchor = attributes['text-anchor'] ?? style['text-anchor'] ?? 'start';
  const color =
    paint(style['fill'] ?? attributes['fill'] ?? style['color'] ?? '#000000', opacity) ?? '#000000';
  const classes = (attributes['class'] ?? '').split(WHITESPACE_RUN);
  const stepClass = classes.find((name) => name.startsWith(TYPE_STEP_PREFIX));
  return {
    index,
    tag: 'text',
    mark: classes.includes(MARK_CLASS),
    attrs: attributes,
    commands: [],
    fill: color,
    stroke: null,
    strokeWidth: 0,
    dash: null,
    cap: 'butt',
    text: {
      lines,
      x: map.x(numberOr(attributes['x'], 0)),
      y: map.y(numberOr(attributes['y'], 0)),
      anchor: anchor === 'middle' || anchor === 'end' ? anchor : 'start',
      size,
      lineHeight: step === undefined ? size * DEFAULT_LINE_HEIGHT : step * map.scale,
      family: firstFamily(style['font-family'] ?? attributes['font-family'] ?? ''),
      weight: weightOf(style['font-weight'] ?? attributes['font-weight']),
      color,
      step: stepClass === undefined ? null : stepClass.slice(TYPE_STEP_PREFIX.length),
    },
  };
}

/**
 * The lines of a text: one per `tspan`, or the whole content when it has none, with the markup
 * removed, entities decoded, whitespace collapsed and empty lines dropped.
 *
 * @param content - The markup between a text's start and end tags.
 */
function textLinesOf(content: string): string[] {
  const spans = [...content.matchAll(TSPAN_PATTERN)].map((span) =>
    decodeText(stripTags(span[1] ?? '')),
  );
  return (spans.length > 0 ? spans : [decodeText(stripTags(content))])
    .map((line) => line.replace(WHITESPACE_RUN, ' ').trim())
    .filter((line) => line !== '');
}

/**
 * The attributes of a start tag.
 *
 * @param text - The attribute part of the tag.
 */
function readAttributes(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  ATTRIBUTE_PATTERN.lastIndex = 0;
  for (
    let match = ATTRIBUTE_PATTERN.exec(text);
    match !== null;
    match = ATTRIBUTE_PATTERN.exec(text)
  ) {
    result[match[1] ?? ''] = decodeText(match[2] ?? '');
  }

  return result;
}

/**
 * An inline style as property to value.
 *
 * @param text - The `style` attribute.
 */
function readStyle(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const declaration of text.split(';')) {
    const colon = declaration.indexOf(':');
    if (colon > 0) {
      result[declaration.slice(0, colon).trim().toLowerCase()] = declaration
        .slice(colon + 1)
        .trim();
    }
  }

  return result;
}

/**
 * A number, or a fallback when the text is missing or not a number.
 *
 * @param text - Text such as `26px` or `0.5`.
 * @param fallback - The value otherwise.
 */
function numberOr(text: string | undefined, fallback: number): number {
  const value = Number.parseFloat(text ?? '');
  return Number.isFinite(value) ? value : fallback;
}

/**
 * The numeric weight of a computed `font-weight`.
 *
 * @param text - The value.
 */
function weightOf(text: string | undefined): number {
  if (text === 'bold') {
    return BOLD_WEIGHT;
  }

  return numberOr(text, NORMAL_WEIGHT);
}

/**
 * The first family of a font stack, unquoted.
 *
 * @param stack - The computed `font-family`.
 */
function firstFamily(stack: string): string {
  return (stack.split(',')[0] ?? '').trim().replace(FAMILY_QUOTES, '');
}

/**
 * The dash pattern of a stroke, or `null` for a solid one.
 *
 * @param attributes - The element's attributes.
 * @param style - Its inline style.
 * @param scale - User units to canvas pixels.
 */
function dashOf(
  attributes: Record<string, string>,
  style: Record<string, string>,
  scale: number,
): number[] | null {
  const value = style['stroke-dasharray'] ?? attributes['stroke-dasharray'] ?? 'none';
  if (value === 'none' || value === '') {
    return null;
  }

  // The kit draws lines in with a `1 1` dash on `pathLength="1"`: at rest the dash covers the
  // whole line.
  if (attributes['pathlength'] !== undefined || attributes['pathLength'] !== undefined) {
    return null;
  }

  const numbers = value.match(NUMBER_PATTERN)?.map((number) => Number(number) * scale) ?? [];
  return numbers.every((number) => number === 0) ? null : numbers;
}

/**
 * The line cap.
 *
 * @param value - The computed `stroke-linecap`.
 */
function capOf(value: string | undefined): 'butt' | 'round' | 'square' {
  return value === 'round' || value === 'square' ? value : 'butt';
}

/**
 * A paint as `#rrggbb` or `#rrggbbaa` with an opacity applied, or `null` for none.
 *
 * @param value - A computed color, `none` or `transparent`.
 * @param opacity - Opacity to multiply in.
 */
export function paint(value: string, opacity: number): string | null {
  const text = value.trim().toLowerCase();
  if (text === 'none' || text === 'transparent' || text === '') {
    return null;
  }

  const rgba = parseColor(text);
  if (rgba === null) {
    return null;
  }

  const alpha = rgba[3] * opacity;
  if (alpha <= 0) {
    return null;
  }

  /**
   * A channel as two hex digits.
   */
  const hex = (channel: number): string =>
    Math.round(Math.max(0, Math.min(CHANNEL_MAX, channel)))
      .toString(HEX_RADIX)
      .padStart(2, '0');
  const rgb = `#${hex(rgba[0])}${hex(rgba[1])}${hex(rgba[2])}`;
  return alpha >= 1 ? rgb : `${rgb}${hex(alpha * CHANNEL_MAX)}`;
}

/**
 * A color's channels, 0 to 255, and alpha, 0 to 1.
 *
 * @param text - `rgb()`, `rgba()` or a hex color.
 */
function parseColor(text: string): [number, number, number, number] | null {
  const rgb = RGB_PATTERN.exec(text);
  if (rgb !== null) {
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), alphaOf(rgb[4])];
  }

  const hex = HEX_PATTERN.exec(text);
  if (hex === null) {
    return null;
  }

  const digits = expandShorthand(hex[1] ?? '');
  /**
   * The channel at a position of the hex digits.
   */
  const channel = (start: number): number =>
    Number.parseInt(digits.slice(start, start + 2), HEX_RADIX);
  return [channel(0), channel(2), channel(4), digits.length === 8 ? channel(6) / CHANNEL_MAX : 1];
}

/**
 * The full hex digits of a color: a three-digit shorthand doubles each digit, and any other length
 * is returned as written.
 *
 * @param digits - The hex digits without the `#`.
 */
function expandShorthand(digits: string): string {
  if (digits.length !== 3) {
    return digits;
  }

  return digits.replace(ANY_CHARACTER, (digit) => digit + digit);
}

/**
 * The alpha of an `rgba()` color: a number or a percentage, 1 when there is none.
 *
 * @param text - The alpha part, if any.
 */
function alphaOf(text: string | undefined): number {
  if (text === undefined) {
    return 1;
  }

  return text.endsWith('%') ? Number.parseFloat(text) / PERCENT : Number.parseFloat(text);
}

/**
 * Removes tags from markup.
 *
 * @param text - Markup.
 */
function stripTags(text: string): string {
  return text.replace(MARKUP_TAG, '');
}

/**
 * Decodes XML character references.
 *
 * @param text - Text with entities.
 */
function decodeText(text: string): string {
  return text
    .replace(HEX_REFERENCE, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, HEX_RADIX)),
    )
    .replace(DECIMAL_REFERENCE, (_, code: string) => String.fromCodePoint(Number(code)))
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&');
}
