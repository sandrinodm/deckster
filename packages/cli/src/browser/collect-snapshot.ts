import type {
  Box,
  EffectiveBackground,
  ElementSnapshot,
  ImageSnapshot,
  RenderErrorSnapshot,
  SlotSnapshot,
  SpacingSnapshot,
} from '#lint/types.ts';

/**
 * What {@link collectElements} returns from the page.
 */
export type CollectedPage = {
  /**
   * The canvas's layout size in canvas pixels; zero when the page has no canvas.
   */
  canvas: { width: number; height: number };

  /**
   * The brand surface of the slide on screen, from its `data-surface`.
   */
  surface: string;

  /**
   * The visible elements of the active slide, in document order.
   */
  elements: ElementSnapshot[];

  /**
   * What each filled layout slot of the active slide holds.
   */
  slots: SlotSnapshot[];

  /**
   * The error the active slide shows in place of its content, or `null`.
   */
  renderError: RenderErrorSnapshot | null;
};

/**
 * Measures every visible element of the slide on screen. It runs inside the browser through
 * `page.evaluate`, so it must not use anything from this module or its imports: no constants, no
 * helper functions outside its body.
 *
 * @returns The canvas size, the surface, the elements in document order and the slots, in canvas
 *   pixels.
 */
export function collectElements(): CollectedPage {
  const slide = document.querySelector<HTMLElement>('section[data-slide-active="true"]');
  const canvasElement = slide?.closest<HTMLElement>('.deck-canvas') ?? null;
  const canvas = {
    width: canvasElement?.offsetWidth ?? 0,
    height: canvasElement?.offsetHeight ?? 0,
  };
  const surface = slide?.getAttribute('data-surface') ?? 'default';
  const elements: ElementSnapshot[] = [];
  const recorded: Element[] = [];
  if (slide === null || canvasElement === null || canvas.width === 0) {
    return { canvas, surface, elements, slots: [], renderError: null };
  }

  const canvasRect = canvasElement.getBoundingClientRect();
  const scale = canvasRect.width / canvas.width;
  const skippedTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);
  const mediaTags = new Set(['IMG', 'VIDEO', 'CANVAS', 'SVG', 'PICTURE']);
  const errorSelector = '[data-slide-error]';
  const COLOR_TOKEN_PATTERN =
    /(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)|#[0-9a-f]{3,8}\b|\btransparent\b/gi;
  const grainMarker = 'feTurbulence';
  const backdropSelector = '[data-backdrop]';
  const RGB_PATTERN =
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/;
  const HEX_PATTERN = /^#([0-9a-f]{6})$/i;
  const SVG_SOURCE_PATTERN = /(?:\.svg(?:[?#]|$))|^data:image\/svg/i;
  const WORD_PATTERN = /[\p{L}\p{N}]/u;
  const MAX_BACKGROUND_COLORS = 32;
  const OPAQUE = 255;
  const HEX_RADIX = 16;
  const LINE_TOLERANCE_RATIO = 0.4;
  const MIN_LINE_TOLERANCE_PX = 4;
  const SLOT_LINE_TOLERANCE_PX = 8;
  const ROUNDING_FACTOR = 100;
  const PERCENT = 100;
  const MEDIA_MIN_PX = 64;
  const PHOTO_SVG_MIN_PX = 200;
  const WHITESPACE_PATTERN = /\s+/;
  const COLLAPSED_WHITESPACE_PATTERN = /\s+/g;
  const FONT_QUOTE_PATTERN = /^["']|["']$/g;
  const HEX_BLUE_OFFSET = 4;
  const PHOTO_TAGS = new Set(['img', 'video', 'canvas', 'picture']);
  const overMediaAttribute = 'data-deck-lint-over-media';
  const codeLinesAttribute = 'data-code-lines';
  const codeLinesSelector = '[data-code-lines]';

  /**
   * Rounds canvas pixels to hundredths, so snapshots stay readable.
   *
   * @param value - A length.
   */
  const round = (value: number): number => Math.round(value * ROUNDING_FACTOR) / ROUNDING_FACTOR;

  /**
   * A client rectangle in canvas pixels, relative to the canvas.
   *
   * @param rect - A rectangle from `getBoundingClientRect` or `getClientRects`.
   */
  const toBox = (rect: DOMRectReadOnly): Box => ({
    x: round((rect.left - canvasRect.left) / scale),
    y: round((rect.top - canvasRect.top) / scale),
    width: round(rect.width / scale),
    height: round(rect.height / scale),
  });

  const paint = document.createElement('canvas');
  paint.width = 1;
  paint.height = 1;
  const paintContext = paint.getContext('2d', { willReadFrequently: true });
  const colorCache = new Map<string, [number, number, number, number]>();

  /**
   * The channels of a color in `rgb()` or `rgba()` syntax, which is how the browser serializes sRGB
   * colors, read exactly; `undefined` for other syntaxes.
   *
   * @param css - A CSS color.
   */
  const readRgb = (css: string): [number, number, number, number] | undefined => {
    const match = RGB_PATTERN.exec(css.trim());
    if (match === null) {
      return undefined;
    }

    const [, r = '0', g = '0', b = '0', a] = match;
    const alpha = a === undefined ? 1 : readAlpha(a);
    return [
      Math.round(Number(r)),
      Math.round(Number(g)),
      Math.round(Number(b)),
      Math.round(alpha * OPAQUE),
    ];
  };

  /**
   * An alpha value: a number from 0 to 1, or a percentage.
   *
   * @param value - Such as `0.08` or `8%`.
   */
  const readAlpha = (value: string): number =>
    value.endsWith('%') ? Number.parseFloat(value) / PERCENT : Number.parseFloat(value);

  /**
   * Any CSS color as 8-bit sRGB channels and alpha (0-255). `rgb()` colors are read as they are;
   * other syntaxes (oklch, `color()`) are converted by a 1x1 canvas, first through its serialized
   * `fillStyle`, then by painting a pixel.
   *
   * @param css - A computed CSS color.
   */
  const toRgba = (css: string): [number, number, number, number] => {
    const cached = colorCache.get(css);
    if (cached !== undefined) {
      return cached;
    }

    const exact = readRgb(css);
    let channels: [number, number, number, number] = exact ?? [0, 0, 0, 0];
    if (exact === undefined && paintContext !== null) {
      paintContext.fillStyle = 'rgba(0, 0, 0, 0)';
      paintContext.fillStyle = css;
      const serialized = String(paintContext.fillStyle);
      const hex = HEX_PATTERN.exec(serialized)?.[1] ?? '';
      /**
       * One channel of the serialized hex color.
       *
       * @param start - The index of its first digit.
       */
      const channel = (start: number) => Number.parseInt(hex.slice(start, start + 2), HEX_RADIX);
      const fromStyle: [number, number, number, number] | undefined =
        hex === ''
          ? readRgb(serialized)
          : [channel(0), channel(2), channel(HEX_BLUE_OFFSET), OPAQUE];
      if (fromStyle === undefined) {
        paintContext.clearRect(0, 0, 1, 1);
        paintContext.fillRect(0, 0, 1, 1);
        const [r = 0, g = 0, b = 0, a = 0] = paintContext.getImageData(0, 0, 1, 1).data;
        channels = [r, g, b, a];
      } else {
        channels = fromStyle;
      }
    }

    colorCache.set(css, channels);
    return channels;
  };

  /**
   * Channels as `#rrggbb`, or `#rrggbbaa` when translucent.
   *
   * @param channels - 8-bit red, green, blue and alpha.
   */
  const toHex = (channels: readonly number[]): string => {
    const [r = 0, g = 0, b = 0, a = 0] = channels;
    const parts = a === OPAQUE ? [r, g, b] : [r, g, b, a];
    return `#${parts.map((part) => part.toString(HEX_RADIX).padStart(2, '0')).join('')}`;
  };

  /**
   * Paints a translucent color over an opaque one.
   *
   * @param top - The color on top.
   * @param bottom - The opaque color underneath.
   */
  const composite = (
    top: readonly number[],
    bottom: readonly number[],
  ): [number, number, number, number] => {
    const alpha = (top[3] ?? 0) / OPAQUE;
    /**
     * One channel of the painted color.
     *
     * @param channel - The channel index: 0 red, 1 green, 2 blue.
     */
    const mix = (channel: number) =>
      Math.round((top[channel] ?? 0) * alpha + (bottom[channel] ?? 0) * (1 - alpha));
    return [mix(0), mix(1), mix(2), OPAQUE];
  };

  /**
   * Splits a computed `background-image` into its layers, at the commas outside parentheses.
   *
   * @param value - A computed `background-image`.
   */
  const splitLayers = (value: string): string[] => {
    const layers: string[] = [];
    let depth = 0;
    let start = 0;
    for (let index = 0; index < value.length; index += 1) {
      const character = value[index];
      if (character === '(') {
        depth += 1;
      } else if (character === ')') {
        depth -= 1;
      } else if (character === ',' && depth === 0) {
        layers.push(value.slice(start, index).trim());
        start = index + 1;
      }
    }

    layers.push(value.slice(start).trim());
    return layers.filter((layer) => layer !== '');
  };

  /**
   * The background layers an element paints, top first: each gradient's colors, then its color.
   * `image` when a picture other than a gradient's noise grain is part of it.
   *
   * @param style - The element's computed style.
   */
  const backgroundLayers = (style: CSSStyleDeclaration): number[][][] | 'image' => {
    const layers: number[][][] = [];
    const image = style.backgroundImage;
    for (const layer of image === 'none' ? [] : splitLayers(image)) {
      if (layer.startsWith('url(')) {
        if (!layer.includes(grainMarker)) {
          return 'image';
        }

        continue;
      }

      const colors = (layer.match(COLOR_TOKEN_PATTERN) ?? []).map(toRgba);
      if (colors.length > 0) {
        layers.push(colors);
      }
    }

    const color = toRgba(style.backgroundColor);
    if (color[3] > 0) {
      layers.push([color]);
    }

    return layers;
  };

  /**
   * What an element's text sits on: every background from the element up to the canvas, painted
   * bottom up over white, until an opaque one hides everything below.
   *
   * @param element - Any element on the slide.
   */
  const effectiveBackground = (element: Element): EffectiveBackground => {
    const layers: number[][][] = [];
    for (let node: Element | null = element; node !== null; node = node.parentElement) {
      const own = backgroundLayers(getComputedStyle(node));
      if (own === 'image') {
        return { kind: 'image' };
      }

      layers.push(...own);
      const isOpaque = own.some((layer) => layer.every((color) => color[3] === OPAQUE));
      if (isOpaque || node === canvasElement) {
        break;
      }
    }

    let colors: number[][] = [[OPAQUE, OPAQUE, OPAQUE, OPAQUE]];
    for (const layer of layers.reverse()) {
      const painted = layer.flatMap((top) => colors.map((bottom) => composite(top, bottom)));
      const unique = new Map(painted.map((color) => [toHex(color), color]));
      colors = [...unique.values()].slice(0, MAX_BACKGROUND_COLORS);
    }

    return { kind: 'colors', colors: colors.map(toHex) };
  };

  /**
   * The product of the element's opacity and its ancestors' up to the slide.
   *
   * @param element - Any element on the slide.
   */
  const effectiveOpacity = (element: Element): number => {
    let opacity = 1;
    for (let node: Element | null = element; node !== null && node !== slide;) {
      opacity *= Number.parseFloat(getComputedStyle(node).opacity) || 0;
      node = node.parentElement;
    }

    return round(opacity);
  };

  /**
   * One value of the computed `scale` property: a number, or a percentage.
   *
   * @param value - Such as `0.3` or `30%`.
   */
  const readScale = (value: string): number =>
    value.endsWith('%') ? Number.parseFloat(value) / PERCENT : Number.parseFloat(value);

  /**
   * How much an HTML element is scaled relative to the canvas: every `transform`, `scale` and
   * `zoom` from the element up to the canvas.
   *
   * @param element - An HTML element on the slide.
   */
  const htmlScale = (element: Element): number => {
    let matrix = new DOMMatrix();
    let factor = 1;
    for (let node: Element | null = element; node !== null && node !== canvasElement;) {
      const style = getComputedStyle(node);
      if (style.transform !== 'none') {
        matrix = new DOMMatrix(style.transform).multiply(matrix);
      }

      if (style.scale !== 'none' && style.scale !== '') {
        const [x = 1, y = x] = style.scale.split(WHITESPACE_PATTERN).map(readScale);
        factor *= Math.sqrt(Math.abs(x * y));
      }

      factor *= Number.parseFloat(style.zoom) || 1;
      node = node.parentElement;
    }

    return Math.sqrt(Math.abs(matrix.a * matrix.d - matrix.b * matrix.c)) * factor;
  };

  /**
   * How much an SVG element is scaled relative to the canvas: its screen matrix, which includes the
   * viewBox scaling and every CSS transform, divided by the canvas's own scale.
   *
   * @param element - An SVG element.
   */
  const svgScale = (element: SVGGraphicsElement): number => {
    const matrix = element.getScreenCTM();
    if (matrix === null) {
      return 1;
    }

    return Math.sqrt(Math.abs(matrix.a * matrix.d - matrix.b * matrix.c)) / scale;
  };

  /**
   * Whether the author marked the element, or an ancestor inside the slide, as decoration.
   *
   * @param element - Any element on the slide.
   */
  const isDecorative = (element: Element): boolean => {
    for (let node: Element | null = element; node !== null && node !== slide;) {
      if (node.getAttribute('aria-hidden') === 'true' || node.hasAttribute('data-decorative')) {
        return true;
      }

      node = node.parentElement;
    }

    return false;
  };

  /**
   * A CSS-like path from the slide to the element, with `:nth-of-type` where siblings share a tag.
   *
   * @param element - An element inside the slide.
   */
  const selectorFor = (element: Element): string => {
    const segments: string[] = [];
    let current: Element | null = element;
    while (current !== null && current !== slide) {
      const tag = current.tagName.toLowerCase();
      const firstClass = current.classList[0];
      const sameTag = Array.from(current.parentElement?.children ?? []).filter(
        (sibling) => sibling.tagName === current?.tagName,
      );
      const position = sameTag.length > 1 ? `:nth-of-type(${sameTag.indexOf(current) + 1})` : '';
      segments.unshift(`${tag}${firstClass === undefined ? '' : `.${firstClass}`}${position}`);
      current = current.parentElement;
    }

    return segments.join(' > ');
  };

  /**
   * The element's own non-empty text nodes, without its children's.
   *
   * @param element - Any element.
   */
  const ownTextNodes = (element: Element): Node[] =>
    Array.from(element.childNodes).filter(
      (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '',
    );

  /**
   * The boxes of the element's own text, one per line fragment.
   *
   * @param element - Any element.
   * @param nodes - Its own text nodes.
   */
  const textBoxes = (element: Element, nodes: readonly Node[]): Box[] => {
    const boxes: Box[] = [];
    for (const node of nodes) {
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of Array.from(range.getClientRects())) {
        if (rect.width > 0 && rect.height > 0) {
          boxes.push(toBox(rect));
        }
      }
    }

    if (boxes.length === 0 && nodes.length > 0 && element instanceof SVGElement) {
      boxes.push(toBox(element.getBoundingClientRect()));
    }

    return boxes;
  };

  /**
   * How many distinct lines a set of text boxes covers: boxes whose vertical centers are within the
   * tolerance count as one line.
   *
   * @param boxes - Text boxes.
   * @param tolerance - The largest gap between centers on one line, in canvas pixels.
   */
  const countLines = (boxes: readonly Box[], tolerance: number): number => {
    const centers = boxes.map((box) => box.y + box.height / 2).sort((a, b) => a - b);
    return centers.filter(
      (center, index) => index === 0 || center - (centers[index - 1] ?? 0) > tolerance,
    ).length;
  };

  /**
   * Counts words: whitespace-separated runs that contain a letter or digit.
   *
   * @param text - Any text.
   */
  const countWords = (text: string): number =>
    text.split(WHITESPACE_PATTERN).filter((word) => WORD_PATTERN.test(word)).length;

  /**
   * A computed length in pixels; 0 for `normal`, `auto` and other keywords.
   *
   * @param value - A computed CSS length.
   */
  const px = (value: string): number => Number.parseFloat(value) || 0;

  /**
   * The element's padding, margin and gap.
   *
   * @param style - Its computed style.
   */
  const spacingOf = (style: CSSStyleDeclaration): SpacingSnapshot => ({
    padding: [
      px(style.paddingTop),
      px(style.paddingRight),
      px(style.paddingBottom),
      px(style.paddingLeft),
    ],
    margin: [
      px(style.marginTop),
      px(style.marginRight),
      px(style.marginBottom),
      px(style.marginLeft),
    ],
    gap: [px(style.rowGap), px(style.columnGap)],
  });

  /**
   * The padding box: the bounding box without the borders.
   *
   * @param rect - The bounding box.
   * @param style - The computed style.
   * @param factor - How much the element is scaled.
   */
  const innerBox = (rect: Box, style: CSSStyleDeclaration, factor: number): Box => {
    const top = px(style.borderTopWidth) * factor;
    const right = px(style.borderRightWidth) * factor;
    const bottom = px(style.borderBottomWidth) * factor;
    const left = px(style.borderLeftWidth) * factor;
    return {
      x: round(rect.x + left),
      y: round(rect.y + top),
      width: round(Math.max(0, rect.width - left - right)),
      height: round(Math.max(0, rect.height - top - bottom)),
    };
  };

  /**
   * An SVG paint as hex, or `null` for `none` and URL paints.
   *
   * @param value - A computed `fill` or `stroke`.
   */
  const paintColor = (value: string): string | null =>
    value === 'none' || value.startsWith('url(') || value === '' ? null : toHex(toRgba(value));

  /**
   * The element's own `data-*` attributes without the prefix.
   *
   * @param element - Any element.
   */
  const dataAttributes = (element: Element): Record<string, string> => {
    const data: Record<string, string> = {};
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name.startsWith('data-')) {
        data[attribute.name.slice('data-'.length)] = attribute.value;
      }
    }

    return data;
  };

  /**
   * An image element's source and intrinsic size.
   *
   * @param element - Any element.
   */
  const imageOf = (element: Element): ImageSnapshot | null => {
    if (!(element instanceof HTMLImageElement)) {
      return null;
    }

    const src = element.currentSrc === '' ? element.src : element.currentSrc;
    return {
      src,
      naturalWidth: element.naturalWidth,
      naturalHeight: element.naturalHeight,
      vector: SVG_SOURCE_PATTERN.test(src),
    };
  };

  /**
   * How CSS cuts the element's text short: an ellipsis that is showing (content wider than the
   * box), a line clamp that hides lines, or nothing.
   *
   * @param element - Any element.
   * @param style - Its computed style.
   */
  const truncationOf = (
    element: Element,
    style: CSSStyleDeclaration,
  ): 'ellipsis' | 'clamp' | null => {
    const clamp = style.getPropertyValue('-webkit-line-clamp');
    if (clamp !== '' && clamp !== 'none' && element.scrollHeight > element.clientHeight + 1) {
      return 'clamp';
    }

    if (style.textOverflow === 'ellipsis' && element.scrollWidth > element.clientWidth + 1) {
      return 'ellipsis';
    }

    return null;
  };

  /**
   * Measures one visible element.
   *
   * @param child - The element.
   * @param style - Its computed style.
   * @param parent - The index of its nearest recorded ancestor.
   */
  const measure = (
    child: Element,
    style: CSSStyleDeclaration,
    parent: number | null,
  ): ElementSnapshot => {
    const inSvg = child instanceof SVGElement && child.tagName.toLowerCase() !== 'svg';
    const factor =
      child instanceof SVGGraphicsElement && inSvg ? svgScale(child) : htmlScale(child);
    const fontSizePx = Number.parseFloat(style.fontSize);
    const renderedFontSizePx = round(fontSizePx * factor);
    const nodes = ownTextNodes(child);
    const text = nodes
      .map((node) => node.textContent ?? '')
      .join(' ')
      .replace(COLLAPSED_WHITESPACE_PATTERN, ' ')
      .trim();
    const textLines = textBoxes(child, nodes);
    const rect = toBox(child.getBoundingClientRect());
    const lineHeight = style.lineHeight === 'normal' ? null : Number.parseFloat(style.lineHeight);
    return {
      index: elements.length,
      parent,
      selector: selectorFor(child),
      tag: child.tagName.toLowerCase(),
      text,
      words: countWords(text),
      lines: countLines(
        textLines,
        Math.max(MIN_LINE_TOLERANCE_PX, renderedFontSizePx * LINE_TOLERANCE_RATIO),
      ),
      textLines,
      rect,
      innerRect: innerBox(rect, style, factor),
      fontFamily: (style.fontFamily.split(',')[0] ?? '').trim().replace(FONT_QUOTE_PATTERN, ''),
      fontSizePx,
      renderedFontSizePx,
      lineHeightPx: lineHeight === null || Number.isNaN(lineHeight) ? null : lineHeight,
      fontWeight: Number.parseFloat(style.fontWeight),
      color: toHex(toRgba(style.color)),
      backgroundColor: toHex(toRgba(style.backgroundColor)),
      paint: inSvg
        ? { fill: paintColor(style.fill), stroke: paintColor(style.stroke) }
        : { fill: null, stroke: null },
      background: effectiveBackground(child),
      opacity: effectiveOpacity(child),
      position: style.position,
      display: style.display,
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      clientWidth: child.clientWidth,
      clientHeight: child.clientHeight,
      scrollWidth: child.scrollWidth,
      scrollHeight: child.scrollHeight,
      spacing: spacingOf(style),
      data: dataAttributes(child),
      decorative: isDecorative(child),
      isMedia: mediaTags.has(child.tagName.toUpperCase()),
      inSvg,
      image: imageOf(child),
      truncation: truncationOf(child, style),
    };
  };

  /**
   * Records the visible children of an element, depth first; hidden ones are skipped but their
   * children are still visited. A slide's error message is not measured: `render-error` reports
   * it.
   *
   * @param element - The element whose children to record.
   * @param parent - The index of the nearest recorded ancestor, or `null` at the top.
   */
  const visit = (element: Element, parent: number | null): void => {
    for (const child of Array.from(element.children)) {
      const style = getComputedStyle(child);
      const isSkipped = skippedTags.has(child.tagName.toUpperCase()) || style.display === 'none';
      if (isSkipped || child.matches(errorSelector)) {
        continue;
      }

      const rect = child.getBoundingClientRect();
      const isVisible = style.visibility === 'visible' && (rect.width > 0 || rect.height > 0);
      if (!isVisible) {
        visit(child, parent);
        continue;
      }

      const snapshot = measure(child, style, parent);
      elements.push(snapshot);
      recorded.push(child);
      visit(child, snapshot.index);
    }
  };
  visit(slide, null);

  /**
   * Whether a recorded element paints a picture text can sit on without being its ancestor: an
   * image, video, canvas or picture, an inline SVG standing in for a photo (a slot's direct child,
   * such as an image layout's media), or a box with a background picture.
   *
   * @param element - A recorded element.
   * @param snapshot - Its snapshot.
   */
  const paintsPicture = (element: Element, snapshot: ElementSnapshot): boolean => {
    const tag = snapshot.tag;
    if (PHOTO_TAGS.has(tag)) {
      return snapshot.rect.width >= MEDIA_MIN_PX && snapshot.rect.height >= MEDIA_MIN_PX;
    }

    if (tag === 'svg') {
      return (
        element.parentElement?.matches('.deck-slot') === true &&
        snapshot.rect.width >= PHOTO_SVG_MIN_PX &&
        snapshot.rect.height >= PHOTO_SVG_MIN_PX
      );
    }

    const image = getComputedStyle(element).backgroundImage;
    return image.includes('url(') && !image.includes(grainMarker);
  };

  /**
   * Whether two boxes overlap by more than a hair.
   *
   * @param a - A box.
   * @param b - Another box.
   */
  const overlaps = (a: Box, b: Box): boolean =>
    a.x < b.x + b.width - 1 &&
    b.x < a.x + a.width - 1 &&
    a.y < b.y + b.height - 1 &&
    b.y < a.y + a.height - 1;

  /**
   * Whether something opaque is painted between an element's text and the slide: a card, a chart's
   * plate, a table cell. A layout's backdrop sits under everything on the slide, so text with such
   * a box behind it never shows the backdrop's pictures.
   *
   * @param element - Any element on the slide.
   */
  const coveredOnSlide = (element: Element): boolean => {
    for (let node: Element | null = element; node !== null; node = node.parentElement) {
      if (node === slide || node.matches(backdropSelector)) {
        return false;
      }

      const own = backgroundLayers(getComputedStyle(node));
      if (own !== 'image' && own.some((layer) => layer.every((color) => color[3] === OPAQUE))) {
        return true;
      }
    }

    return false;
  };

  /**
   * Marks the text that sits over a picture it is not inside of (a title over a full-bleed photo, a
   * line over a layout's background layers), or over an image background. Its colors are read from
   * the pixels under it, which the caller samples from a screenshot, so the element is marked for
   * that. Text over a backdrop picture is marked only when nothing opaque lies between them.
   */
  const markTextOverPictures = (): void => {
    const pictures = recorded
      .map((element, index) => ({ element, snapshot: elements[index] }))
      .filter(
        (entry): entry is { element: Element; snapshot: ElementSnapshot } =>
          entry.snapshot !== undefined && paintsPicture(entry.element, entry.snapshot),
      );
    recorded.forEach((element, index) => {
      const snapshot = elements[index];
      if (snapshot === undefined || snapshot.text === '' || snapshot.decorative) {
        return;
      }

      const covered = coveredOnSlide(element);
      const under = pictures.filter(
        (picture) =>
          !picture.element.contains(element) &&
          !element.contains(picture.element) &&
          !(covered && picture.element.closest(backdropSelector) !== null) &&
          snapshot.textLines.some((line) => overlaps(line, picture.snapshot.rect)),
      );
      if (snapshot.background.kind === 'image' || under.length > 0) {
        const onBackdrop =
          snapshot.background.kind !== 'image' &&
          under.every((picture) => picture.element.closest(backdropSelector) !== null);
        element.setAttribute(overMediaAttribute, String(snapshot.index));
        elements[index] = {
          ...snapshot,
          background: { kind: 'media', colors: [], ...(onBackdrop ? { backdrop: true } : {}) },
        };
      }
    });
  };
  markTextOverPictures();

  /**
   * The blocks a slot holds by content kind: a table (Markdown or the kit's), a chart, a diagram,
   * code, an image or video (an inline SVG only as the slot's own child, so icons in text do not
   * count), a list, a heading, a quote, a number, or text. A block of a structural kind is counted
   * once and not looked into; text is any element with words of its own. Decoration is skipped.
   *
   * @param slotElement - The slot's `.deck-slot` wrapper.
   */
  const contentKinds = (slotElement: Element): Record<string, number> => {
    const kinds: Record<string, number> = {};
    /**
     * Counts one block of a kind.
     */
    const add = (kind: string): void => {
      kinds[kind] = (kinds[kind] ?? 0) + 1;
    };
    const blockKinds: readonly [string, string][] = [
      ['table', 'table, [role="table"], [data-chart="table"]'],
      [
        'number',
        '.kit-stat, .kit-stat-row, :is([data-chart="big-number"], [data-chart="stat-row"], ' +
          '[data-chart="sparkline"], [data-chart="progress"])',
      ],
      ['chart', '[data-chart]'],
      ['diagram', '[data-diagram], .kit-diagram'],
      ['code', 'pre, .kit-code, .kit-code-move, .kit-terminal'],
      ['video', 'video'],
      ['image', 'img, picture'],
      ['bullets', 'ul, ol'],
      ['heading', 'h1, h2, h3, h4, h5, h6'],
      ['quote', 'blockquote'],
    ];
    /**
     * Counts the blocks among an element's children, looking into those of no block kind.
     */
    const walk = (parent: Element): void => {
      for (const child of Array.from(parent.children)) {
        if (
          skippedTags.has(child.tagName.toUpperCase()) ||
          child.matches('[data-decorative], [aria-hidden="true"], figcaption')
        ) {
          continue;
        }

        const block = blockKinds.find(([, selector]) => child.matches(selector))?.[0];
        if (block !== undefined) {
          add(block);
          continue;
        }

        if (child.tagName.toLowerCase() === 'svg') {
          if (parent === slotElement) {
            add('image');
          }

          continue;
        }

        const hasOwnText = Array.from(child.childNodes).some(
          (node) => node.nodeType === Node.TEXT_NODE && WORD_PATTERN.test(node.textContent ?? ''),
        );
        if (hasOwnText) {
          add('text');
        }

        walk(child);
      }
    };
    if (
      Array.from(slotElement.childNodes).some(
        (node) => node.nodeType === Node.TEXT_NODE && WORD_PATTERN.test(node.textContent ?? ''),
      )
    ) {
      add('text');
    }

    walk(slotElement);
    return kinds;
  };

  /**
   * Counts the words, list items and lines of one slot. A code block or terminal says how many
   * lines of code it holds (`data-code-lines`), which is what a layout's `maxLines` budgets: its
   * title bar and line numbers are not code, and a blank line counts whether or not it shows a
   * number. Any other text counts its distinct vertical positions, so wrapped text counts every
   * line it takes.
   *
   * @param element - The slot's `.deck-slot` wrapper.
   */
  const measureSlot = (element: Element): SlotSnapshot => {
    const boxes: Box[] = [];
    const codeLines = Array.from(element.querySelectorAll(codeLinesSelector)).reduce(
      (sum, block) => sum + (Number(block.getAttribute(codeLinesAttribute)) || 0),
      0,
    );
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const enclosingCode = node.parentElement?.closest(codeLinesSelector) ?? null;
      if (
        (node.textContent ?? '').trim() === '' ||
        (enclosingCode !== null && element.contains(enclosingCode))
      ) {
        continue;
      }

      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of Array.from(range.getClientRects())) {
        if (rect.width > 0 && rect.height > 0) {
          boxes.push(toBox(rect));
        }
      }
    }

    return {
      name: element.getAttribute('data-slot') ?? '',
      words: countWords(element.textContent ?? ''),
      bullets: element.querySelectorAll('li').length,
      lines: codeLines + countLines(boxes, SLOT_LINE_TOLERANCE_PX),
      kinds: contentKinds(element),
    };
  };
  const slots = Array.from(slide.querySelectorAll('.deck-slot[data-slot]')).map(measureSlot);
  const problem = slide.querySelector(errorSelector);
  const renderError =
    problem === null
      ? null
      : {
          file: problem.querySelector('.deck-problem-file')?.textContent ?? '',
          message: (
            problem.querySelector('.deck-problem-message')?.textContent ??
            problem.textContent ??
            ''
          ).trim(),
        };
  return { canvas, surface, elements, slots, renderError };
}
