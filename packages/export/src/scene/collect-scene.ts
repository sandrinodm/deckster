import type {
  CollectedNode,
  CollectedScene,
  CollectOptions,
  RawVectorShape,
} from '#scene/collected.ts';
import type {
  GradientStop,
  RasterHint,
  RunStyle,
  SceneBorder,
  SceneBullet,
  SceneCell,
  SceneLine,
  SceneLink,
  ScenePaint,
  SceneParagraph,
  SceneRect,
  SceneRun,
  SceneShadow,
} from '#scene/scene.ts';

/**
 * Measures everything the slide on screen draws, for the PPTX writer: text as rendered lines and
 * runs with their fonts, painted boxes, pictures with their crops, inline SVG, media posters,
 * tables, published chart and diagram descriptions, links, and what keeps an element from being
 * native. It runs inside the browser through `page.evaluate`, so it uses nothing from outside its
 * body. It marks every element it records with `data-export-id` and turns CSS pseudo-elements into
 * real elements while it measures; call {@link releaseScene} afterwards.
 *
 * @param options - The placeholder selectors of the slide's layout.
 * @returns The collected scene in canvas pixels; an empty scene when no slide is active.
 */
export function collectScene(options: CollectOptions): CollectedScene {
  const slide = document.querySelector<HTMLElement>('section[data-slide-active="true"]');
  const canvasElement = slide?.closest<HTMLElement>('.deck-canvas') ?? null;
  const canvas = {
    width: canvasElement?.offsetWidth ?? 0,
    height: canvasElement?.offsetHeight ?? 0,
  };
  const surface = slide?.getAttribute('data-surface') ?? 'default';
  const layout = slide?.querySelector('[data-layout]')?.getAttribute('data-layout') ?? 'default';
  const nodes: CollectedNode[] = [];
  const links: SceneLink[] = [];
  const warnings: string[] = [];
  const tree: Record<string, number | null> = {};
  const empty: CollectedScene = {
    canvas,
    surface,
    layout,
    background: null,
    backgroundIsImage: false,
    nodes,
    links,
    warnings,
    tree,
  };
  if (slide === null || canvasElement === null || canvas.width === 0) {
    return empty;
  }

  const ID_ATTRIBUTE = 'data-export-id';
  const PSEUDO_ATTRIBUTE = 'data-export-pseudo';
  const HOST_ATTRIBUTE = 'data-export-pseudo-host';
  const BULLET_ATTRIBUTE = 'data-export-bullet';
  const PSEUDO_STYLE_ID = 'deck-export-pseudo-style';
  // CHART_SPEC_ATTRIBUTE of @deckster/kit/chart-spec: this function runs in the page and cannot
  // import it.
  const CHART_ATTRIBUTE = 'data-chart-spec';
  // This function runs in the page and cannot import DIAGRAM_DESCRIPTION_ATTRIBUTE from
  // @deckster/kit/diagram-description.
  const DIAGRAM_ATTRIBUTE = 'data-diagram-description';
  const DIAGRAM_ICON_SELECTOR = '[data-diagram-part="icon"]';
  const canvasRect = canvasElement.getBoundingClientRect();
  const scale = canvasRect.width / canvas.width;
  const ROUNDING_FACTOR = 100;
  const OPAQUE = 255;
  const HEX_RADIX = 16;
  const PERCENT = 100;
  const FULL_BLEED_TOLERANCE_PX = 2;
  const BACKDROP_SELECTOR = '[data-backdrop]';
  const SLIDE_IMAGE_SELECTOR = '[data-backdrop-layer="slide"]';
  const SAME_BOX_TOLERANCE_PX = 3;
  // An inline element's background (a code chip, a highlight) paints under the text of the
  // paragraph it sits in, which is recorded at the paragraph's index plus a quarter.
  const INLINE_BOX_OFFSET = 0.1;
  // A chart or diagram paints over its own element's plate and under the element's text.
  const FIGURE_OFFSET = 0.2;
  const RGB_PATTERN =
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/;
  const HEX_PATTERN = /^#([0-9a-f]{6})$/i;
  // `#rrggbb`: the length of an opaque color as `toHex` writes it.
  const OPAQUE_HEX_LENGTH = 7;
  const COLOR_TOKEN_PATTERN =
    /(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)|#[0-9a-f]{3,8}\b|\btransparent\b/gi;
  const LENGTH_PATTERN = /-?[\d.]+px/g;
  const ANGLE_DEG_PATTERN = /^(-?[\d.]+)deg/;
  const DIRECTION_PATTERN = /^to\s+([a-z\s]+)/;
  const CONTENT_TOKEN_PATTERN =
    /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|counter\(([^)]*)\)|attr\(([^)]*)\)|open-quote|close-quote/g;
  const SVG_SOURCE_PATTERN = /(?:\.svg(?:[?#]|$))|^data:image\/svg/i;
  // The white space CSS collapses: not the no-break spaces, which keep a number and its unit
  // together.
  const WHITESPACE_PATTERN = /[ \t\n\r\f]+/g;
  const VARIATION_PATTERN = /"([a-zA-Z]{4})"\s+(-?[\d.]+)/g;
  const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'LINK', 'META']);
  const INLINE_DISPLAYS = new Set(['inline', 'contents']);
  const VECTOR_TAGS = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
  const SVG_STRUCTURE_TAGS = new Set(['g', 'svg', 'title', 'desc', 'defs', 'symbol']);
  const PRESERVED_WHITESPACE = new Set(['pre', 'pre-wrap', 'break-spaces']);
  // PowerPoint's text measures a little differently from Chromium's, and a viewer without the
  // brand's fonts sets wider ones: a one-line text gets 30% room to spare, a wrapped one is tried
  // 30% wider than its longest line, at its column plus 1% and at its longest line plus 2%.
  const SLACK_PX = 4;
  const COLUMN_SLACK = 1.01;
  const LINE_SLACK = 1.02;
  // Rounding allowance, in pixels, when comparing a candidate width with the column or its
  // longest line.
  const WIDTH_TOLERANCE_PX = 0.01;
  const ASCII_LIMIT = 0x80;
  const OVERLAP_SCAN_LIMIT = 80;
  const SHORT_TEXT_LENGTH = 24;
  const INLINE_GAP_EM = 0.18;
  const ROOMIER_SLACK = 1.3;
  const TIGHT_BOX_RATIO = 1.1;
  const CODE_SELECTOR = '.kit-code-pre, .kit-code-move';
  const CODE_TEXT_LAYER = 1e6;
  // The detail of the hint for the brand's grain layer, which the writer tiles as a small picture.
  const GRAIN_DETAIL = 'background-image: grain texture';
  const NEGATIVE_LAYER_BASE = -1000;
  const FLOW_LAYER = 1;
  const POSITIONED_LAYER = 2;
  const GENERIC_FAMILIES = new Set([
    'serif',
    'sans-serif',
    'monospace',
    'cursive',
    'fantasy',
    'system-ui',
    'ui-serif',
    'ui-sans-serif',
    'ui-monospace',
    'ui-rounded',
    'emoji',
    'math',
  ]);
  const RTL_PATTERN = /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}]/u;
  const COMPLEX_SCRIPT_PATTERN =
    /[\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Gurmukhi}\p{Script=Gujarati}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}\p{Script=Tibetan}\p{Script=Sinhala}]/u;
  const EMOJI_SEQUENCE_PATTERN = /‍|️|[\u{1F3FB}-\u{1F3FF}]|[\u{1F1E6}-\u{1F1FF}]/u;
  const CALC_PREFIX_PATTERN = /^calc\(/;
  const RADIAL_POSITION_PATTERN = /at\s+([\d.]+)%\s+([\d.]+)%/;
  const GRAIN_URL_PATTERN = /^url\("data:image\/svg\+xml/i;
  const TURBULENCE_PATTERN = /feTurbulence/i;
  const UNESCAPE_CONTENT_PATTERN = /\\(.)/g;
  const FLEX_CONTAINER_PATTERN = /flex|grid/;
  const FAMILY_QUOTES_PATTERN = /^["']|["']$/g;
  const CAPITALIZE_WORD_PATTERN = /(^|\s)(\p{L})/gu;
  const WHITESPACE_TEST_PATTERN = /\s/;
  const LEADING_SPACES_PATTERN = /^ +/;
  const TRAILING_SPACES_PATTERN = / +$/;
  const AXIS_ALIGNMENT_TOLERANCE = 1e-6;
  const FALLBACK_ASCENT_EM = 0.9;
  const FALLBACK_DESCENT_EM = 0.22;
  const BMP_MAX_CODE_POINT = 0xffff;
  const ROOMIER_SECOND_SHARE = 0.9;
  const ROOMIER_THIRD_SHARE = 0.8;
  const HALF_PIXEL_SLACK = 0.5;
  const FONT_METRIC_TOLERANCE_PX = 0.01;
  const MIN_OPACITY_DIVISOR = 1e-6;
  const TABLE_CONTENT_OFFSET = 0.5;
  const MEDIA_ID_OFFSET = 0.5;
  const TEXT_ID_OFFSET = 0.25;

  const DIRECTION_ANGLES: Record<string, number> = {
    top: 0,
    'top right': 45,
    'right top': 45,
    right: 90,
    'bottom right': 135,
    'right bottom': 135,
    bottom: 180,
    'bottom left': 225,
    'left bottom': 225,
    left: 270,
    'top left': 315,
    'left top': 315,
  };

  /**
   * Rounds to hundredths so scenes stay readable.
   *
   * @param value - A number.
   */
  const round = (value: number): number => Math.round(value * ROUNDING_FACTOR) / ROUNDING_FACTOR;

  /**
   * A client rectangle in canvas pixels relative to the canvas.
   *
   * @param rect - A client rectangle.
   */
  const toRect = (rect: DOMRectReadOnly): SceneRect => ({
    x: round((rect.left - canvasRect.left) / scale),
    y: round((rect.top - canvasRect.top) / scale),
    width: round(rect.width / scale),
    height: round(rect.height / scale),
  });

  /**
   * A computed length in pixels; 0 for keywords.
   *
   * @param value - A computed CSS length.
   */
  const px = (value: string): number =>
    // Chromium serialises some computed lengths as `calc(1.75px)`.
    Number.parseFloat(value.replace(CALC_PREFIX_PATTERN, '')) || 0;

  const paint = document.createElement('canvas');
  paint.width = 1;
  paint.height = 1;
  const paintContext = paint.getContext('2d', { willReadFrequently: true });
  const colorCache = new Map<string, number[]>();

  /**
   * An alpha value: a number from 0 to 1, or a percentage.
   *
   * @param value - Such as `0.08` or `8%`.
   */
  const readAlpha = (value: string): number =>
    value.endsWith('%') ? Number.parseFloat(value) / PERCENT : Number.parseFloat(value);

  /**
   * Any CSS color as 8-bit channels and alpha (0-255), through a 1x1 canvas for syntaxes other than
   * `rgb()`.
   *
   * @param css - A computed color.
   */
  const toRgba = (css: string): number[] => {
    const cached = colorCache.get(css);
    if (cached !== undefined) {
      return cached;
    }

    const match = RGB_PATTERN.exec(css.trim());
    let channels: number[] = [0, 0, 0, 0];
    if (match !== null) {
      const [, r = '0', g = '0', b = '0', a] = match;
      const alpha = a === undefined ? 1 : readAlpha(a);
      channels = [Number(r), Number(g), Number(b), alpha * OPAQUE].map(Math.round);
    } else if (paintContext !== null && css !== 'transparent') {
      paintContext.fillStyle = 'rgba(0, 0, 0, 0)';
      paintContext.fillStyle = css;
      const serialized = String(paintContext.fillStyle);
      const hex = HEX_PATTERN.exec(serialized)?.[1];
      if (hex === undefined) {
        paintContext.clearRect(0, 0, 1, 1);
        paintContext.fillRect(0, 0, 1, 1);
        channels = Array.from(paintContext.getImageData(0, 0, 1, 1).data);
      } else {
        channels = [0, 2, 4].map((start) =>
          Number.parseInt(hex.slice(start, start + 2), HEX_RADIX),
        );
        channels.push(OPAQUE);
      }
    }

    colorCache.set(css, channels);
    return channels;
  };

  /**
   * A color as hex, with an opacity factor folded into its alpha.
   *
   * @param css - A computed color.
   * @param opacity - A factor from 0 to 1.
   */
  const toHex = (css: string, opacity = 1): string => {
    const [r = 0, g = 0, b = 0, a = 0] = toRgba(css);
    const alpha = Math.round(a * opacity);
    const parts = alpha >= OPAQUE ? [r, g, b] : [r, g, b, alpha];
    return `#${parts.map((part) => part.toString(HEX_RADIX).padStart(2, '0')).join('')}`;
  };

  /**
   * The alpha of a color, 0 to 255.
   *
   * @param css - A computed color.
   */
  const alphaOf = (css: string): number => toRgba(css)[3] ?? 0;

  /**
   * Splits a computed list value at the commas outside parentheses.
   *
   * @param value - Such as a `background-image` or `box-shadow`.
   */
  const splitTopLevel = (value: string): string[] => {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    for (let index = 0; index < value.length; index += 1) {
      const character = value[index];
      if (character === '(') {
        depth += 1;
      } else if (character === ')') {
        depth -= 1;
      } else if (character === ',' && depth === 0) {
        parts.push(value.slice(start, index).trim());
        start = index + 1;
      }
    }

    parts.push(value.slice(start).trim());
    return parts.filter((part) => part !== '');
  };

  /**
   * The stops of a gradient's arguments after its direction, spread evenly where positions are
   * missing.
   *
   * @param args - The comma-separated arguments that hold colors.
   * @param opacity - The element's opacity.
   */
  const readStops = (args: readonly string[], opacity: number): GradientStop[] => {
    const raw = args.flatMap((arg) => {
      const color = (arg.match(COLOR_TOKEN_PATTERN) ?? [])[0];
      if (color === undefined) {
        return [];
      }

      const rest = arg.replace(color, '').trim();
      const position = rest.endsWith('%') ? Number.parseFloat(rest) / PERCENT : null;
      return [{ color: toHex(color, opacity), at: position }];
    });
    return raw.map((stop, index) => ({
      color: stop.color,
      at: round(stop.at ?? (raw.length === 1 ? 0 : index / (raw.length - 1))),
    }));
  };

  /**
   * One gradient layer as a paint, or `null` for a kind PowerPoint cannot fill with.
   *
   * @param layer - A `linear-gradient(...)` or `radial-gradient(...)` layer.
   * @param opacity - The element's opacity.
   */
  const readGradient = (layer: string, opacity: number): ScenePaint | null => {
    const open = layer.indexOf('(');
    const name = layer.slice(0, open);
    const args = splitTopLevel(layer.slice(open + 1, -1));
    const [first = ''] = args;
    if (name === 'linear-gradient') {
      const degrees = ANGLE_DEG_PATTERN.exec(first)?.[1];
      const direction = DIRECTION_PATTERN.exec(first)?.[1]?.trim();
      const hasDirection = degrees !== undefined || direction !== undefined;
      const angle =
        degrees === undefined ? (DIRECTION_ANGLES[direction ?? 'bottom'] ?? 180) : Number(degrees);
      return {
        kind: 'linear',
        angle,
        stops: readStops(hasDirection ? args.slice(1) : args, opacity),
      };
    }

    if (name === 'radial-gradient') {
      const hasShape = !COLOR_TOKEN_PATTERN.test(first);
      COLOR_TOKEN_PATTERN.lastIndex = 0;
      const at = RADIAL_POSITION_PATTERN.exec(first);
      return {
        kind: 'radial',
        center: {
          x: at === null ? 0.5 : Number(at[1]) / PERCENT,
          y: at === null ? 0.5 : Number(at[2]) / PERCENT,
        },
        stops: readStops(hasShape ? args.slice(1) : args, opacity),
      };
    }

    return null;
  };

  /**
   * Whether every color of a paint is opaque.
   *
   * @param paint - A fill as {@link readFill} reads it, colors as `#rrggbb` or `#rrggbbaa`.
   */
  const isOpaquePaint = (paint: ScenePaint): boolean => {
    const colors = paint.kind === 'solid' ? [paint.color] : paint.stops.map((stop) => stop.color);
    return colors.every((color) => color.length <= OPAQUE_HEX_LENGTH);
  };

  /**
   * The element's fill: its top gradient, else its color, and the hints for layers PowerPoint
   * cannot fill with.
   *
   * @param style - The computed style.
   * @param opacity - The element's opacity.
   */
  const readFill = (
    style: CSSStyleDeclaration,
    opacity: number,
  ): { fill: ScenePaint | null; hints: RasterHint[]; image: boolean } => {
    const hints: RasterHint[] = [];
    const image = style.backgroundImage;
    const layers = image === 'none' ? [] : splitTopLevel(image);
    let gradient: ScenePaint | null = null;
    let hasImage = false;
    for (const layer of layers) {
      if (layer.startsWith('url(')) {
        hasImage = true;
        const isGrain = GRAIN_URL_PATTERN.test(layer) && TURBULENCE_PATTERN.test(layer);
        hints.push({
          reason: 'background-image',
          scope: 'paint',
          detail: isGrain ? GRAIN_DETAIL : 'background-image: url()',
        });
        continue;
      }

      const parsed = layer.startsWith('repeating-') ? null : readGradient(layer, opacity);
      if (parsed === null) {
        hints.push({
          reason: 'conic-gradient',
          scope: 'paint',
          detail: `background-image: ${layer.slice(0, layer.indexOf('('))}`,
        });
      } else if (gradient === null) {
        gradient = parsed;
      } else {
        hints.push({
          reason: 'background-image',
          scope: 'paint',
          detail: 'several gradient layers',
        });
      }
    }

    const color = style.backgroundColor;
    const solid: ScenePaint | null =
      alphaOf(color) > 0 ? { kind: 'solid', color: toHex(color, opacity) } : null;
    return { fill: gradient ?? solid, hints, image: hasImage };
  };

  /**
   * One border side, or `null` when it paints nothing.
   *
   * @param style - The computed style.
   * @param side - `Top`, `Right`, `Bottom` or `Left`.
   * @param opacity - The element's opacity.
   */
  const readBorder = (
    style: CSSStyleDeclaration,
    side: 'Top' | 'Right' | 'Bottom' | 'Left',
    opacity: number,
  ): SceneBorder | null => {
    const width = px(style.getPropertyValue(`border-${side.toLowerCase()}-width`));
    const lineStyle = style.getPropertyValue(`border-${side.toLowerCase()}-style`);
    const color = style.getPropertyValue(`border-${side.toLowerCase()}-color`);
    if (width <= 0 || lineStyle === 'none' || lineStyle === 'hidden' || alphaOf(color) === 0) {
      return null;
    }

    const kind = lineStyle === 'dashed' || lineStyle === 'dotted' ? lineStyle : 'solid';
    return { width: round(width), color: toHex(color, opacity), style: kind };
  };

  /**
   * The corner radii, resolved against the box.
   *
   * @param style - The computed style.
   * @param rect - The element's box.
   */
  const readRadii = (
    style: CSSStyleDeclaration,
    rect: SceneRect,
  ): [number, number, number, number] => {
    const limit = Math.min(rect.width, rect.height) / 2;
    const corners = [
      style.borderTopLeftRadius,
      style.borderTopRightRadius,
      style.borderBottomRightRadius,
      style.borderBottomLeftRadius,
    ].map((value) => {
      const first = value.split(' ')[0] ?? '0';
      const radius = first.endsWith('%')
        ? (Number.parseFloat(first) / PERCENT) * Math.min(rect.width, rect.height)
        : px(first);
      return round(Math.min(radius, limit));
    });
    return [corners[0] ?? 0, corners[1] ?? 0, corners[2] ?? 0, corners[3] ?? 0];
  };

  /**
   * The `box-shadow` layers.
   *
   * @param value - The computed `box-shadow`.
   * @param opacity - The element's opacity.
   */
  const readShadows = (value: string, opacity: number): SceneShadow[] => {
    if (value === 'none') {
      return [];
    }

    return splitTopLevel(value).flatMap((layer) => {
      const color = (layer.match(COLOR_TOKEN_PATTERN) ?? [])[0];
      const lengths = (layer.replace(color ?? '', '').match(LENGTH_PATTERN) ?? []).map(px);
      const [x = 0, y = 0, blur = 0, spread = 0] = lengths;
      if (color === undefined || alphaOf(color) === 0) {
        return [];
      }

      return [
        {
          x,
          y,
          blur,
          spread,
          color: toHex(color, opacity),
          inset: layer.includes('inset'),
        },
      ];
    });
  };

  /**
   * What keeps an element from being drawn natively.
   *
   * @param element - The element.
   * @param style - Its computed style.
   */
  const readHints = (element: Element, style: CSSStyleDeclaration): RasterHint[] => {
    const hints: RasterHint[] = [];
    const filter = style.filter;
    const isPlainGrayscale = element instanceof HTMLImageElement && filter === 'grayscale(1)';
    if (filter !== 'none' && filter !== '' && !isPlainGrayscale) {
      hints.push({ reason: 'filter', scope: 'subtree', detail: `filter: ${filter}` });
    }

    const backdrop = style.getPropertyValue('backdrop-filter');
    if (backdrop !== 'none' && backdrop !== '') {
      hints.push({
        reason: 'backdrop-filter',
        scope: 'subtree',
        detail: `backdrop-filter: ${backdrop}`,
      });
    }

    if (style.mixBlendMode !== 'normal') {
      hints.push({
        reason: 'blend-mode',
        scope: 'subtree',
        detail: `mix-blend-mode: ${style.mixBlendMode}`,
      });
    }

    const mask =
      style.getPropertyValue('mask-image') || style.getPropertyValue('-webkit-mask-image');
    if (mask !== 'none' && mask !== '') {
      hints.push({ reason: 'mask', scope: 'subtree', detail: 'mask-image' });
    }

    if (style.clipPath !== 'none' && style.clipPath !== '') {
      hints.push({ reason: 'clip-path', scope: 'subtree', detail: `clip-path: ${style.clipPath}` });
    }

    if (style.transform !== 'none') {
      const matrix = new DOMMatrix(style.transform);
      const isAxisAligned =
        Math.abs(matrix.b) < AXIS_ALIGNMENT_TOLERANCE &&
        Math.abs(matrix.c) < AXIS_ALIGNMENT_TOLERANCE;
      if (!isAxisAligned) {
        hints.push({
          reason: 'transform',
          scope: 'subtree',
          detail: `transform: ${style.transform}`,
        });
      }
    }

    const clip =
      style.getPropertyValue('background-clip') ||
      style.getPropertyValue('-webkit-background-clip');
    if (clip === 'text') {
      hints.push({ reason: 'text-effect', scope: 'subtree', detail: 'background-clip: text' });
    }

    if (style.textShadow !== 'none' && style.textShadow !== '') {
      hints.push({
        reason: 'text-effect',
        scope: 'subtree',
        detail: `text-shadow: ${style.textShadow}`,
      });
    }

    if (style.writingMode !== 'horizontal-tb') {
      hints.push({
        reason: 'vertical-text',
        scope: 'subtree',
        detail: `writing-mode: ${style.writingMode}`,
      });
    }

    if (element instanceof HTMLCanvasElement) {
      hints.push({ reason: 'canvas', scope: 'subtree', detail: '<canvas>' });
    }

    if (element instanceof HTMLIFrameElement) {
      hints.push({ reason: 'iframe', scope: 'subtree', detail: '<iframe>' });
    }

    const ownOpacity = Number.parseFloat(style.opacity);
    if (ownOpacity < 1 && ownOpacity > 0 && hasOverlappingPaint(element)) {
      hints.push({
        reason: 'group-opacity',
        scope: 'subtree',
        detail: `opacity: ${style.opacity} over overlapping parts`,
      });
    }

    return hints;
  };

  /**
   * Whether an element, or what is inside it, paints parts that overlap: then its opacity fades the
   * group as one picture in the browser, while PowerPoint would fade each part on its own and let
   * the lower parts show through the upper ones.
   *
   * @param element - The translucent element.
   */
  const hasOverlappingPaint = (element: Element): boolean => {
    const painted: DOMRect[] = [];
    const candidates = [element, ...Array.from(element.querySelectorAll('*'))].slice(
      0,
      OVERLAP_SCAN_LIMIT,
    );
    for (const candidate of candidates) {
      const style = getComputedStyle(candidate);
      const draws =
        candidate instanceof HTMLImageElement ||
        candidate instanceof SVGSVGElement ||
        candidate instanceof HTMLVideoElement ||
        alphaOf(style.backgroundColor) > 0 ||
        style.backgroundImage !== 'none' ||
        (style.borderTopStyle !== 'none' && px(style.borderTopWidth) > 0);
      if (!draws || style.visibility !== 'visible') {
        continue;
      }

      const rect = candidate.getBoundingClientRect();
      if (rect.width * rect.height === 0) {
        continue;
      }

      const overlaps = painted.some((other) => {
        const width = Math.min(rect.right, other.right) - Math.max(rect.left, other.left);
        const height = Math.min(rect.bottom, other.bottom) - Math.max(rect.top, other.top);
        return width > 1 && height > 1;
      });
      if (overlaps) {
        return true;
      }

      painted.push(rect);
    }

    return false;
  };

  /**
   * A CSS-like path from the slide to the element.
   *
   * @param element - An element in the canvas.
   */
  const selectorFor = (element: Element): string => {
    const segments: string[] = [];
    let current: Element | null = element;
    while (current !== null && current !== slide && current !== canvasElement) {
      const tag = current.tagName.toLowerCase();
      const firstClass = current.classList[0];
      const parent: Element | null = current.parentElement;
      const sameTag = Array.from(parent?.children ?? []).filter(
        (sibling) => sibling.tagName === current?.tagName,
      );
      const position = sameTag.length > 1 ? `:nth-of-type(${sameTag.indexOf(current) + 1})` : '';
      segments.unshift(`${tag}${firstClass === undefined ? '' : `.${firstClass}`}${position}`);
      current = parent;
    }

    return segments.join(' > ');
  };

  /**
   * The text a pseudo-element's `content` produces, or `null` for content this module does not
   * reproduce (images).
   *
   * @param content - The computed `content`.
   * @param host - The element the pseudo-element belongs to.
   */
  const pseudoText = (content: string, host: Element): string | null => {
    let text = '';
    let matched = false;
    for (const token of content.matchAll(CONTENT_TOKEN_PATTERN)) {
      matched = true;
      const [whole, double, single, counter, attribute] = token;
      if (double !== undefined || single !== undefined) {
        text += (double ?? single ?? '').replace(UNESCAPE_CONTENT_PATTERN, '$1');
      } else if (counter !== undefined) {
        text += counterText(counter, host);
      } else if (attribute !== undefined) {
        text += host.getAttribute(attribute.trim()) ?? '';
      } else {
        text += whole === 'open-quote' ? '“' : '”';
      }
    }

    return matched ? text : null;
  };

  /**
   * The value of a `counter(name, style)` for a list item: its position among the items of its
   * list, in the counter style.
   *
   * @param args - The counter's arguments.
   * @param host - The list item.
   */
  const counterText = (args: string, host: Element): string => {
    const style = (args.split(',')[1] ?? 'decimal').trim();
    const list = host.closest('ol, ul');
    const items =
      list === null
        ? [host]
        : Array.from(list.querySelectorAll('li')).filter((item) => item.closest('ol, ul') === list);
    const value = Math.max(1, items.indexOf(host) + 1);
    const alpha = 'abcdefghijklmnopqrstuvwxyz';
    switch (style) {
      case 'decimal-leading-zero': {
        return String(value).padStart(2, '0');
      }

      case 'lower-alpha':
      case 'lower-latin': {
        return alpha[(value - 1) % alpha.length] ?? '';
      }

      case 'upper-alpha':
      case 'upper-latin': {
        return (alpha[(value - 1) % alpha.length] ?? '').toUpperCase();
      }

      default: {
        return String(value);
      }
    }
  };

  /**
   * Replaces the canvas's pseudo-elements with real elements styled like them, so they are measured
   * as boxes and text. {@link releaseScene} removes them again.
   *
   * @param roots - The elements whose subtrees to scan.
   */
  const materializePseudoElements = (roots: readonly Element[]): void => {
    const planned: { host: Element; which: 'before' | 'after'; span: HTMLSpanElement }[] = [];
    for (const root of roots) {
      for (const host of [root, ...Array.from(root.querySelectorAll('*'))]) {
        if (host instanceof SVGElement || SKIPPED_TAGS.has(host.tagName.toUpperCase())) {
          continue;
        }

        for (const which of ['before', 'after'] as const) {
          const style = getComputedStyle(host, `::${which}`);
          const content = style.content;
          if (content === 'none' || content === 'normal' || style.display === 'none') {
            continue;
          }

          const span = document.createElement('span');
          for (let index = 0; index < style.length; index += 1) {
            const name = style.item(index);
            if (name !== 'content') {
              span.style.setProperty(name, style.getPropertyValue(name));
            }
          }

          span.style.setProperty('animation', 'none');
          span.style.setProperty('transition', 'none');
          span.textContent = pseudoText(content, host) ?? '';
          span.setAttribute(PSEUDO_ATTRIBUTE, which);
          planned.push({ host, which, span });
        }
      }
    }

    // A real element changes which children match :first-child, :last-child and :empty, which can
    // move them; hosts whose layout changes keep their pseudo-elements, and are reported.
    const hosts = [...new Set(planned.map((entry) => entry.host))];
    const before = new Map(hosts.map((host) => [host, layoutOf(host)]));
    for (const { host, which, span } of planned) {
      if (which === 'before') {
        host.insertBefore(span, host.firstChild);
      } else {
        host.append(span);
      }

      const tokens = new Set((host.getAttribute(HOST_ATTRIBUTE) ?? '').split(' ').filter(Boolean));
      tokens.add(which);
      host.setAttribute(HOST_ATTRIBUTE, [...tokens].join(' '));
    }

    if (planned.length > 0 && document.getElementById(PSEUDO_STYLE_ID) === null) {
      const sheet = document.createElement('style');
      sheet.id = PSEUDO_STYLE_ID;
      sheet.textContent =
        `[${HOST_ATTRIBUTE}~="before"]::before { content: none !important; }\n` +
        `[${HOST_ATTRIBUTE}~="after"]::after { content: none !important; }`;
      document.head.append(sheet);
    }

    for (const host of hosts) {
      if (layoutOf(host) === before.get(host)) {
        continue;
      }

      for (const span of Array.from(host.children)) {
        if (span.hasAttribute(PSEUDO_ATTRIBUTE)) {
          span.remove();
        }
      }

      host.removeAttribute(HOST_ATTRIBUTE);
      warnings.push(
        `${selectorFor(host)}: its ::before/::after could not be measured without moving its ` +
          'content; it is left out of native shapes.',
      );
    }
  };

  /**
   * The boxes of an element and its children (pseudo-element stand-ins left out), as text, to tell
   * whether its layout changed.
   *
   * @param host - The element.
   */
  const layoutOf = (host: Element): string =>
    [host, ...Array.from(host.children).filter((child) => !child.hasAttribute(PSEUDO_ATTRIBUTE))]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return [rect.left, rect.top, rect.width, rect.height]
          .map((value) => Math.round(value * 2))
          .join(' ');
      })
      .join('|');

  /**
   * The effective opacity of an element: its own and its ancestors' up to the canvas.
   *
   * @param element - The element.
   */
  const effectiveOpacity = (element: Element): number => {
    let opacity = 1;
    for (let node: Element | null = element; node !== null && node !== canvasElement;) {
      opacity *= Number.parseFloat(getComputedStyle(node).opacity) || 0;
      node = node.parentElement;
    }

    return round(opacity);
  };

  /**
   * Where an element paints within the stacking context that holds it: negative z-index under the
   * flow, the flow, positioned elements (and other elements painted like them: translucent,
   * transformed, filtered) without a z-index, then positive z-index in order.
   *
   * @param style - The element's computed style.
   * @param flexItem - Whether its parent is a flex or grid container, where z-index applies too.
   */
  const ownLayer = (style: CSSStyleDeclaration, flexItem: boolean): number => {
    const positioned = style.position !== 'static';
    const z = Number.parseInt(style.zIndex, 10);
    if (!Number.isNaN(z) && (positioned || flexItem)) {
      if (z < 0) {
        return NEGATIVE_LAYER_BASE + z;
      }

      return z === 0 ? POSITIONED_LAYER : POSITIONED_LAYER + z;
    }

    const paintsAsPositioned =
      positioned ||
      Number.parseFloat(style.opacity) < 1 ||
      style.transform !== 'none' ||
      style.filter !== 'none' ||
      style.mixBlendMode !== 'normal' ||
      style.isolation === 'isolate';
    return paintsAsPositioned ? POSITIONED_LAYER : FLOW_LAYER;
  };

  /**
   * The paint order key of an element: for each ancestor that paints as a unit (a stacking context
   * or a positioned element), its layer and document position, outermost first, then the element's
   * own layer. Keys compare element by element, so z-index only orders elements within the same
   * stacking context, as in CSS.
   *
   * @param element - The element.
   */
  const paintLayer = (element: Element): number[] => {
    const chain: Element[] = [];
    for (let node: Element | null = element; node !== null && node !== canvasElement;) {
      chain.unshift(node);
      node = node.parentElement;
    }

    const key: number[] = [];
    chain.forEach((node, index) => {
      const style = getComputedStyle(node);
      const parent = node.parentElement;
      const parentDisplay = parent === null ? '' : getComputedStyle(parent).display;
      const flexItem = FLEX_CONTAINER_PATTERN.test(parentDisplay);
      const layer = ownLayer(style, flexItem);
      if (index === chain.length - 1) {
        key.push(layer);
      } else if (layer !== FLOW_LAYER) {
        key.push(layer, documentIndexes.get(node) ?? 0);
      }
    });
    return key;
  };

  /**
   * The visible rectangle of an element after every ancestor that clips its overflow, and the
   * clipping ancestor's radii when it hugs the element.
   *
   * @param element - The element.
   * @param rect - Its own box.
   */
  const clipOf = (
    element: Element,
    rect: SceneRect,
  ): { rect: SceneRect; radii: [number, number, number, number] | null } => {
    let left = Math.max(rect.x, 0);
    let top = Math.max(rect.y, 0);
    let right = Math.min(rect.x + rect.width, canvas.width);
    let bottom = Math.min(rect.y + rect.height, canvas.height);
    let radii: [number, number, number, number] | null = null;
    for (let node = element.parentElement; node !== null && node !== canvasElement;) {
      const style = getComputedStyle(node);
      if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
        const box = toRect(node.getBoundingClientRect());
        left = Math.max(left, box.x);
        top = Math.max(top, box.y);
        right = Math.min(right, box.x + box.width);
        bottom = Math.min(bottom, box.y + box.height);
        const nodeRadii = readRadii(style, box);
        const hugs =
          Math.abs(box.x - left) < SAME_BOX_TOLERANCE_PX &&
          Math.abs(box.y - top) < SAME_BOX_TOLERANCE_PX &&
          Math.abs(box.x + box.width - right) < SAME_BOX_TOLERANCE_PX &&
          Math.abs(box.y + box.height - bottom) < SAME_BOX_TOLERANCE_PX;
        if (radii === null && hugs && nodeRadii.some((radius) => radius > 0)) {
          radii = nodeRadii;
        }
      }

      node = node.parentElement;
    }

    return {
      rect: {
        x: round(left),
        y: round(top),
        width: round(Math.max(0, right - left)),
        height: round(Math.max(0, bottom - top)),
      },
      radii,
    };
  };

  /**
   * The crop an `object-fit` picture gets, as fractions of the image cut off on each side, and the
   * box the visible part fills.
   *
   * @param image - The image element.
   * @param rect - Its box.
   * @param style - Its computed style.
   */
  const objectCrop = (
    image: HTMLImageElement,
    rect: SceneRect,
    style: CSSStyleDeclaration,
  ): { crop: { left: number; top: number; right: number; bottom: number }; rect: SceneRect } => {
    const none = { left: 0, top: 0, right: 0, bottom: 0 };
    const naturalWidth = image.naturalWidth;
    const naturalHeight = image.naturalHeight;
    if (naturalWidth === 0 || naturalHeight === 0 || style.objectFit === 'fill') {
      return { crop: none, rect };
    }

    const coverScale = Math.max(rect.width / naturalWidth, rect.height / naturalHeight);
    const containScale = Math.min(rect.width / naturalWidth, rect.height / naturalHeight);
    const fits: Record<string, number> = {
      cover: coverScale,
      contain: containScale,
      none: 1 / scale,
      'scale-down': Math.min(containScale, 1 / scale),
    };
    const factor = fits[style.objectFit] ?? 1;
    const drawnWidth = naturalWidth * factor;
    const drawnHeight = naturalHeight * factor;
    const [positionX = '50%', positionY = '50%'] = style.objectPosition.split(' ');

    /**
     * Where the drawn image starts along one axis, from `object-position`.
     *
     * @param position - The computed position on that axis.
     * @param free - The box size minus the drawn size.
     */
    const offset = (position: string, free: number): number =>
      position.endsWith('%') ? (free * Number.parseFloat(position)) / PERCENT : px(position);
    const drawnX = rect.x + offset(positionX, rect.width - drawnWidth);
    const drawnY = rect.y + offset(positionY, rect.height - drawnHeight);
    const left = Math.max(rect.x, drawnX);
    const top = Math.max(rect.y, drawnY);
    const right = Math.min(rect.x + rect.width, drawnX + drawnWidth);
    const bottom = Math.min(rect.y + rect.height, drawnY + drawnHeight);
    return {
      crop: {
        left: round((left - drawnX) / drawnWidth),
        top: round((top - drawnY) / drawnHeight),
        right: round((drawnX + drawnWidth - right) / drawnWidth),
        bottom: round((drawnY + drawnHeight - bottom) / drawnHeight),
      },
      rect: {
        x: round(left),
        y: round(top),
        width: round(right - left),
        height: round(bottom - top),
      },
    };
  };

  const metricsContext = document.createElement('canvas').getContext('2d');
  const metricsCache = new Map<string, { ascent: number; descent: number }>();

  /**
   * The ascent and descent of a font, in canvas pixels, from the browser's font metrics.
   *
   * @param style - The computed style of the text.
   * @param size - The font size in canvas pixels.
   */
  const fontMetrics = (
    style: CSSStyleDeclaration,
    size: number,
  ): { ascent: number; descent: number } => {
    const font = `${style.fontStyle} ${style.fontWeight} ${size}px ${style.fontFamily}`;
    const cached = metricsCache.get(font);
    if (cached !== undefined) {
      return cached;
    }

    let metrics = { ascent: size * FALLBACK_ASCENT_EM, descent: size * FALLBACK_DESCENT_EM };
    if (metricsContext !== null) {
      metricsContext.font = font;
      const measured = metricsContext.measureText('Hg');
      metrics = {
        ascent: round(measured.fontBoundingBoxAscent),
        descent: round(measured.fontBoundingBoxDescent),
      };
    }

    metricsCache.set(font, metrics);
    return metrics;
  };

  /**
   * How much an element is scaled relative to the canvas, through CSS transforms and `zoom`.
   *
   * @param element - The element.
   */
  const elementScale = (element: Element): number => {
    let matrix = new DOMMatrix();
    let factor = 1;
    for (let node: Element | null = element; node !== null && node !== canvasElement;) {
      const style = getComputedStyle(node);
      if (style.transform !== 'none') {
        matrix = new DOMMatrix(style.transform).multiply(matrix);
      }

      factor *= Number.parseFloat(style.zoom) || 1;
      node = node.parentElement;
    }

    return Math.sqrt(Math.abs(matrix.a * matrix.d - matrix.b * matrix.c)) * factor;
  };

  /**
   * The style of a run of text, as rendered.
   *
   * @param element - The element whose text it is.
   * @param opacity - The element's effective opacity.
   */
  const runStyle = (element: Element, opacity: number): RunStyle => {
    const style = getComputedStyle(element);
    const size = round(px(style.fontSize) * elementScale(element));
    const metrics = fontMetrics(style, size);
    const decorations = new Set<string>();
    for (let node: Element | null = element; node !== null && node !== canvasElement;) {
      for (const line of getComputedStyle(node).textDecorationLine.split(' ')) {
        decorations.add(line);
      }

      const display = getComputedStyle(node).display;
      if (!INLINE_DISPLAYS.has(display)) {
        break;
      }

      node = node.parentElement;
    }

    const axes: Record<string, number> = { wght: Number.parseFloat(style.fontWeight) };
    for (const match of style.fontVariationSettings.matchAll(VARIATION_PATTERN)) {
      const [, tag = '', value = '0'] = match;
      axes[tag] = Number(value);
    }

    const stretch = style.fontStretch;
    if (stretch.endsWith('%') && axes['wdth'] === undefined) {
      axes['wdth'] = Number.parseFloat(stretch);
    }

    const caps = style.textTransform === 'uppercase' ? 'all' : 'none';
    return {
      family: (style.fontFamily.split(',')[0] ?? '').trim().replace(FAMILY_QUOTES_PATTERN, ''),
      stack: style.fontFamily,
      size,
      weight: Number.parseFloat(style.fontWeight),
      italic: style.fontStyle !== 'normal',
      color: toHex(style.color, opacity),
      letterSpacing: style.letterSpacing === 'normal' ? 0 : round(px(style.letterSpacing)),
      caps: style.fontVariantCaps === 'small-caps' ? 'small' : caps,
      underline: decorations.has('underline'),
      strike: decorations.has('line-through'),
      shift:
        style.verticalAlign === 'super' || style.verticalAlign === 'sub'
          ? style.verticalAlign
          : 'none',
      axes,
      ascent: metrics.ascent,
      descent: metrics.descent,
    };
  };

  /**
   * Applies `text-transform` values PowerPoint has no attribute for to the text itself.
   *
   * @param text - The source text.
   * @param transform - The computed `text-transform`.
   */
  const transformText = (text: string, transform: string): string => {
    if (transform === 'lowercase') {
      return text.toLowerCase();
    }

    if (transform === 'capitalize') {
      return text.replace(
        CAPITALIZE_WORD_PATTERN,
        (_, space: string, letter: string) => space + letter.toUpperCase(),
      );
    }

    return text;
  };

  /**
   * Whether an element is laid out inline, so its text belongs to the surrounding paragraph.
   *
   * @param element - The element.
   */
  const isInline = (element: Element): boolean => {
    const style = getComputedStyle(element);
    const positioned = style.position === 'absolute' || style.position === 'fixed';
    return INLINE_DISPLAYS.has(style.display) && !positioned && style.float === 'none';
  };

  /**
   * The link an element is part of.
   *
   * @param element - The element.
   */
  const hrefOf = (element: Element): string | null =>
    element.closest('a[href]')?.getAttribute('href') ?? null;

  /**
   * The slot an element is in.
   *
   * @param element - The element.
   */
  const slotOf = (element: Element): string | null =>
    element.closest('.deck-slot[data-slot]')?.getAttribute('data-slot') ?? null;

  /**
   * The step at which an element appears, from its nearest step wrapper.
   *
   * @param element - The element.
   */
  const stepOf = (element: Element): number | null => {
    const wrapper = element.closest('.deck-step');
    if (wrapper === null) {
      return null;
    }

    const value = wrapper.getAttribute('data-step');
    if (value !== null && Number.isFinite(Number(value))) {
      return Number(value);
    }

    // A step without `at` takes the next number in render order.
    const automatic = Array.from(slide.querySelectorAll('.deck-step:not([data-step])'));
    return automatic.indexOf(wrapper) + 1;
  };

  /**
   * The step whose content covers and replaces an element, from its closest `data-replaced-at`. It
   * is `null` when that step is not reached in the captured page (no `.deck-step` of that number is
   * shown), so the element stays ordinary content there.
   *
   * @param element - The element.
   */
  const replacedAtOf = (element: Element): number | null => {
    const owner = element.closest('[data-replaced-at]');
    if (owner === null) {
      return null;
    }

    const step = Number(owner.getAttribute('data-replaced-at'));
    if (!Number.isInteger(step) || step <= 0) {
      return null;
    }

    const reached = Array.from(slide.querySelectorAll(`.deck-step[data-step="${step}"]`)).some(
      (wrapper) => wrapper.getAttribute('data-step-state') !== 'hidden',
    );
    return reached ? step : null;
  };

  /**
   * The lines of a paragraph: its text and the text of its inline descendants, split where the
   * browser broke the lines.
   *
   * @param root - The paragraph's element.
   */
  const readLines = (root: Element): SceneLine[] => {
    const lines: (SceneLine & { top: number; bottom: number; lastRight: number })[] = [];
    const collapses = !PRESERVED_WHITESPACE.has(getComputedStyle(root).whiteSpace);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node) => {
        if (node === root || node.nodeType === Node.TEXT_NODE) {
          return NodeFilter.FILTER_ACCEPT;
        }

        const element = node as Element;
        if (element.tagName === 'BR') {
          return NodeFilter.FILTER_ACCEPT;
        }

        const style = getComputedStyle(element);
        const skip =
          element instanceof SVGElement ||
          element.hasAttribute(BULLET_ATTRIBUTE) ||
          SKIPPED_TAGS.has(element.tagName.toUpperCase()) ||
          style.display === 'none' ||
          !isInline(element);
        return skip ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
      },
    });
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if (node.nodeType !== Node.TEXT_NODE) {
        const lastLine = lines.at(-1);
        if (lastLine !== undefined && (node as Element).tagName === 'BR') {
          lastLine.authored = true;
        }

        continue;
      }

      const parent = node.parentElement;
      const source = node.textContent ?? '';
      if (parent === null || source === '') {
        continue;
      }

      const parentStyle = getComputedStyle(parent);
      if (parentStyle.visibility !== 'visible') {
        continue;
      }

      const baseStyle = runStyle(parent, effectiveOpacity(parent));
      const href = hrefOf(parent);
      const range = document.createRange();
      for (let index = 0; index < source.length;) {
        const code = source.codePointAt(index) ?? 0;
        const length = code > BMP_MAX_CODE_POINT ? 2 : 1;
        const character = source.slice(index, index + length);
        range.setStart(node, index);
        range.setEnd(node, index + length);
        index += length;
        if (character === '\n' && !collapses) {
          const lastLine = lines.at(-1);
          if (lastLine !== undefined) {
            lastLine.authored = true;
          }

          continue;
        }

        const isSpace = WHITESPACE_PATTERN.test(character);
        WHITESPACE_PATTERN.lastIndex = 0;
        const style = isSpace ? baseStyle : renderedStyle(baseStyle, parentStyle, character);
        if (isSpace && collapses) {
          const last = lines.at(-1)?.runs.at(-1);
          if (last !== undefined && !last.text.endsWith(' ')) {
            last.text += ' ';
          }

          continue;
        }

        const [first] = Array.from(range.getClientRects()).filter((rect) => rect.height > 0);
        if (first === undefined) {
          continue;
        }

        const box = toRect(first);
        const center = box.y + box.height / 2;
        let line = lines.at(-1);
        if (line === undefined || center < line.top || center > line.bottom) {
          line = {
            runs: [],
            baseline: 0,
            left: box.x,
            right: box.x + box.width,
            ascent: 0,
            descent: 0,
            authored: false,
            top: box.y,
            bottom: box.y + box.height,
            lastRight: box.x,
          };
          lines.push(line);
        }

        const text = transformText(character, parentStyle.textTransform);
        // Inline boxes set apart by a margin or a gap (a number and its unit) get the space the
        // browser shows between them, which the text itself does not have.
        const previousRun = line.runs.at(-1);
        if (
          previousRun !== undefined &&
          !previousRun.text.endsWith(' ') &&
          box.x - line.lastRight > style.size * INLINE_GAP_EM
        ) {
          previousRun.text += ' ';
        }

        line.lastRight = box.x + box.width;
        let run = line.runs.at(-1);
        if (run === undefined || run.style !== style || run.href !== href) {
          run = { text: '', style, href, rect: { ...box } };
          line.runs.push(run);
        }

        run.text += text;
        const right = Math.max(run.rect.x + run.rect.width, box.x + box.width);
        const bottom = Math.max(run.rect.y + run.rect.height, box.y + box.height);
        run.rect.x = Math.min(run.rect.x, box.x);
        run.rect.y = Math.min(run.rect.y, box.y);
        run.rect.width = round(right - run.rect.x);
        run.rect.height = round(bottom - run.rect.y);
        line.top = Math.min(line.top, box.y);
        line.bottom = Math.max(line.bottom, box.y + box.height);
        line.left = Math.min(line.left, box.x);
        line.right = Math.max(line.right, box.x + box.width);
      }
    }

    return lines.flatMap((line) => {
      const runs = trimRuns(line.runs);
      if (runs.length === 0) {
        return [];
      }

      const dominant = runs.reduce((best, run) => (run.style.size > best.style.size ? run : best));
      const contentHeight = dominant.style.ascent + dominant.style.descent;
      const ratio = contentHeight > 0 ? dominant.rect.height / contentHeight : 1;
      return [
        {
          runs,
          baseline: round(dominant.rect.y + dominant.style.ascent * ratio),
          left: round(line.left),
          right: round(line.right),
          ascent: Math.max(...runs.map((run) => run.style.ascent)),
          descent: Math.max(...runs.map((run) => run.style.descent)),
          authored: line.authored,
        },
      ];
    });
  };

  /**
   * The text of a code block as PowerPoint sets it: one paragraph per rendered line, a run per
   * token with its color, the indentation and the gaps between tokens (Magic Move places tokens as
   * boxes) as spaces in the monospaced font, and no wrapping.
   *
   * @param root - The code block (`pre`, or a Magic Move container).
   */
  const readCode = (root: Element): SceneParagraph[] => {
    const characters: { text: string; rect: SceneRect; style: RunStyle; href: string | null }[] =
      [];
    const styles = new Map<Element, RunStyle>();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const parent = node.parentElement;
      const source = node.textContent ?? '';
      if (parent === null || source.trim() === '') {
        continue;
      }

      const parentStyle = getComputedStyle(parent);
      if (parentStyle.visibility !== 'visible' || effectiveOpacity(parent) === 0) {
        continue;
      }

      let style = styles.get(parent);
      if (style === undefined) {
        style = runStyle(parent, effectiveOpacity(parent));
        styles.set(parent, style);
      }

      for (let index = 0; index < source.length; index += 1) {
        const character = source[index] ?? '';
        if (WHITESPACE_TEST_PATTERN.test(character)) {
          continue;
        }

        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const first = Array.from(range.getClientRects()).find((rect) => rect.height > 0);
        if (first !== undefined) {
          characters.push({ text: character, rect: toRect(first), style, href: hrefOf(parent) });
        }
      }
    }

    if (characters.length === 0) {
      return [];
    }

    const widths = characters.map((character) => character.rect.width).sort((a, b) => a - b);
    const cell = widths[Math.floor(widths.length / 2)] ?? 1;
    const byCenter = [...characters].sort(
      (a, b) => a.rect.y + a.rect.height / 2 - (b.rect.y + b.rect.height / 2),
    );
    const rows: (typeof characters)[] = [];
    let bottom = Number.NEGATIVE_INFINITY;
    for (const character of byCenter) {
      const center = character.rect.y + character.rect.height / 2;
      if (center > bottom || rows.length === 0) {
        rows.push([character]);
        bottom = character.rect.y + character.rect.height;
      } else {
        rows.at(-1)?.push(character);
      }
    }

    const left = Math.min(...characters.map((character) => character.rect.x));
    const rootStyle = getComputedStyle(root);
    const box = contentBox(toRect(root.getBoundingClientRect()), rootStyle);
    const step = stepOf(root);
    const replacedAt = replacedAtOf(root);
    const lines = rows.map((row): SceneLine => {
      row.sort((a, b) => a.rect.x - b.rect.x);
      const runs: SceneRun[] = [];
      let previousRight = left;
      for (const character of row) {
        const gap = Math.max(0, Math.round((character.rect.x - previousRight) / cell));
        const last = runs.at(-1);
        if (last !== undefined && last.style === character.style && last.href === character.href) {
          last.text += ' '.repeat(gap) + character.text;
          last.rect.width = round(character.rect.x + character.rect.width - last.rect.x);
        } else if (last !== undefined && gap > 0) {
          last.text += ' '.repeat(gap);
          runs.push({
            text: character.text,
            style: character.style,
            href: character.href,
            rect: { ...character.rect },
          });
        } else {
          const lead = runs.length === 0 ? ' '.repeat(gap) : '';
          runs.push({
            text: lead + character.text,
            style: character.style,
            href: character.href,
            rect: { ...character.rect },
          });
        }

        previousRight = character.rect.x + character.rect.width;
      }

      const dominant = runs.reduce((best, run) => (run.style.size > best.style.size ? run : best));
      const top = Math.min(...row.map((character) => character.rect.y));
      const height =
        Math.max(...row.map((character) => character.rect.y + character.rect.height)) - top;
      const contentHeight = dominant.style.ascent + dominant.style.descent;
      const ratio = contentHeight > 0 ? height / contentHeight : 1;
      return {
        runs,
        baseline: round(top + dominant.style.ascent * ratio),
        left: round(left),
        right: round(previousRight),
        ascent: dominant.style.ascent,
        descent: dominant.style.descent,
        authored: true,
      };
    });
    const pitch =
      lines.length > 1
        ? ((lines.at(-1)?.baseline ?? 0) - (lines[0]?.baseline ?? 0)) / (lines.length - 1)
        : px(rootStyle.lineHeight) || (lines[0]?.ascent ?? 0) + (lines[0]?.descent ?? 0);
    return lines.map((line) => ({
      lines: [line],
      step,
      replacedAt,
      align: 'left',
      box: { ...box, x: round(left), width: round(Math.max(box.width, line.right - left)) },
      lineHeight: round(pitch),
      bullet: null,
      level: 0,
      wrapWidth: null,
      keepBreaks: false,
    }));
  };

  /**
   * Where each rendered line of an element's text starts, as the number of visible characters
   * before it, joined: two calls give the same value when the browser broke the lines in the same
   * places.
   *
   * @param root - The paragraph's element.
   */
  const lineStarts = (root: Element): string => {
    const starts: number[] = [];
    let count = 0;
    let bottom = Number.NEGATIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const source = node.textContent ?? '';
      const host = node.parentElement;
      if (host === null || host.closest(`[${BULLET_ATTRIBUTE}]`) !== null) {
        continue;
      }

      for (let index = 0; index < source.length; index += 1) {
        if (WHITESPACE_TEST_PATTERN.test(source[index] ?? '')) {
          continue;
        }

        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const rect = range.getClientRects()[0];
        if (rect === undefined || rect.height === 0) {
          continue;
        }

        const center = rect.top + rect.height / 2;
        if (center < top || center > bottom) {
          starts.push(count);
          top = rect.top;
          bottom = rect.bottom;
        } else {
          top = Math.min(top, rect.top);
          bottom = Math.max(bottom, rect.bottom);
        }

        count += 1;
      }
    }

    return starts.join(',');
  };

  /**
   * How PowerPoint should wrap a paragraph so its lines break where the browser's did: the width of
   * the CSS column when greedy wrapping in it gives the same lines, else the width of the longest
   * line (which reproduces a balanced or pretty wrap), each checked by laying the element out again
   * at that width with plain wrapping; when neither does, the breaks are kept.
   *
   * @param element - The paragraph's element.
   * @param style - Its computed style.
   * @param box - Its content box.
   * @param lines - Its measured lines.
   * @param textLeft - Where its text starts.
   * @param inTable - Whether it is in a table cell, which wraps at the cell's width.
   */
  const wrapFit = (
    element: Element,
    style: CSSStyleDeclaration,
    box: SceneRect,
    lines: readonly SceneLine[],
    textLeft: number,
    inTable: boolean,
  ): { wrapWidth: number | null; keepBreaks: boolean } => {
    const offset = Math.max(0, textLeft - box.x);
    const column = Math.max(1, box.width - offset);
    const longest = Math.max(...lines.map((line) => line.right - line.left));
    const noWrap =
      style.whiteSpace === 'nowrap' ||
      style.whiteSpace === 'pre' ||
      style.getPropertyValue('text-wrap-mode') === 'nowrap';
    if (noWrap) {
      return { wrapWidth: null, keepBreaks: lines.length > 1 };
    }

    const roomy = round(
      Math.min(
        Math.max(column, longest * ROOMIER_SLACK),
        Math.max(column, canvas.width - textLeft),
      ),
    );
    // One line in a box sized to it (a stat, a label, a chip), or a short run without spaces, stays
    // one line however the viewer's font measures: it never wrapped in the browser either.
    const text = (element.textContent ?? '').trim();
    const shrinkWrapped = column <= longest + SLACK_PX;
    const unbreakable = text.length <= SHORT_TEXT_LENGTH && !WHITESPACE_TEST_PATTERN.test(text);
    if (lines.length === 1 && !inTable && (shrinkWrapped || unbreakable)) {
      return { wrapWidth: null, keepBreaks: false };
    }

    if (inTable) {
      // A table cell's text wraps at the cell's width, whatever box the text sits in inside it.
      const cell = element.closest('td, th');
      const cellBox =
        cell === null
          ? null
          : contentBox(toRect(cell.getBoundingClientRect()), getComputedStyle(cell));
      return { wrapWidth: round(Math.max(column, cellBox?.width ?? column)), keepBreaks: false };
    }

    if (lines.length < 2 || !(element instanceof HTMLElement)) {
      return { wrapWidth: roomy, keepBreaks: false };
    }

    const original = lineStarts(element);
    const saved = element.getAttribute('style');
    // A box hugging its longest line (a balanced heading) is tried wider first, up to the slide's
    // edge: as long as the breaks stay the same, a wider font in an app without the brand's fonts
    // then wraps between words instead of inside one.
    const room = Math.max(0, canvas.width - textLeft);
    const roomier = [
      ROOMIER_SLACK,
      ROOMIER_SLACK * ROOMIER_SECOND_SHARE,
      ROOMIER_SLACK * ROOMIER_THIRD_SHARE,
    ]
      .map((factor) => longest * factor)
      .filter((width) => width <= room);
    const tight = column < longest * TIGHT_BOX_RATIO;
    const columns = [column * COLUMN_SLACK, column];
    const candidates = [
      ...(tight ? [...roomier, ...columns] : [...columns, ...roomier]),
      longest * LINE_SLACK + 1,
      longest + HALF_PIXEL_SLACK,
    ];
    let found: number | null = null;
    for (const candidate of candidates) {
      const isRoomier = roomier.includes(candidate);
      const tooWide = !isRoomier && candidate > column * COLUMN_SLACK + WIDTH_TOLERANCE_PX;
      const tooNarrow = candidate < longest - WIDTH_TOLERANCE_PX;
      if (tooWide || tooNarrow) {
        continue;
      }

      element.style.setProperty('box-sizing', 'content-box', 'important');
      element.style.setProperty('width', `${candidate + offset}px`, 'important');
      element.style.setProperty('max-width', 'none', 'important');
      element.style.setProperty('min-width', '0', 'important');
      element.style.setProperty('flex', 'none', 'important');
      element.style.setProperty('text-wrap', 'wrap', 'important');
      const same = lineStarts(element) === original;
      if (saved === null) {
        element.removeAttribute('style');
      } else {
        element.setAttribute('style', saved);
      }

      if (same) {
        found = candidate;
        break;
      }
    }

    return found === null
      ? { wrapWidth: roomy, keepBreaks: true }
      : { wrapWidth: round(found), keepBreaks: false };
  };

  const coverageCache = new Map<string, boolean>();
  const derivedStyles = new Map<RunStyle, Map<string, RunStyle>>();

  /**
   * Whether a family draws a character itself rather than falling back: the character measures the
   * same whichever generic family follows it.
   *
   * @param family - The family.
   * @param style - The text's computed style, for weight and style.
   * @param character - The character.
   */
  const covers = (family: string, style: CSSStyleDeclaration, character: string): boolean => {
    const key = `${family}|${style.fontWeight}|${style.fontStyle}|${character}`;
    const cached = coverageCache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    let result = true;
    if (metricsContext !== null) {
      const font = `${style.fontStyle} ${style.fontWeight} 64px "${family}"`;
      metricsContext.font = `${font}, monospace`;
      const mono = metricsContext.measureText(character).width;
      metricsContext.font = `${font}, serif`;
      const serif = metricsContext.measureText(character).width;
      metricsContext.font = `${font}, sans-serif`;
      const sans = metricsContext.measureText(character).width;
      result =
        Math.abs(mono - serif) < FONT_METRIC_TOLERANCE_PX &&
        Math.abs(serif - sans) < FONT_METRIC_TOLERANCE_PX;
    }

    coverageCache.set(key, result);
    return result;
  };

  /**
   * The style a character renders in: the run's style, or a copy naming the family of the stack
   * that draws it when the first family has no glyph for it (CJK, emoji, symbols), or the generic
   * family when none of the named families does.
   *
   * @param style - The run's style.
   * @param computed - The text's computed style.
   * @param character - The character.
   */
  const renderedStyle = (
    style: RunStyle,
    computed: CSSStyleDeclaration,
    character: string,
  ): RunStyle => {
    if (
      (character.codePointAt(0) ?? 0) < ASCII_LIMIT ||
      covers(style.family, computed, character)
    ) {
      return style;
    }

    const families = style.stack
      .split(',')
      .map((family) => family.trim().replace(FAMILY_QUOTES_PATTERN, ''))
      .filter((family) => family !== '');
    const family =
      families.find(
        (candidate) =>
          candidate !== style.family &&
          !GENERIC_FAMILIES.has(candidate) &&
          covers(candidate, computed, character),
      ) ??
      families.find((candidate) => GENERIC_FAMILIES.has(candidate)) ??
      'sans-serif';
    let byFamily = derivedStyles.get(style);
    if (byFamily === undefined) {
      byFamily = new Map();
      derivedStyles.set(style, byFamily);
    }

    const existing = byFamily.get(family);
    if (existing !== undefined) {
      return existing;
    }

    const derived = { ...style, family, axes: {} };
    byFamily.set(family, derived);
    return derived;
  };

  /**
   * Why a paragraph's text cannot be set as native PowerPoint text that keeps its shape, or `null`:
   * right-to-left text, scripts that shape glyphs across characters, and emoji sequences, which the
   * per-character measurement splits.
   *
   * @param element - The paragraph's element.
   * @param style - Its computed style.
   */
  const complexText = (element: Element, style: CSSStyleDeclaration): string | null => {
    const text = element.textContent ?? '';
    if (style.direction === 'rtl' || RTL_PATTERN.test(text)) {
      return 'right-to-left text';
    }

    if (COMPLEX_SCRIPT_PATTERN.test(text)) {
      return 'complex script';
    }

    return EMOJI_SEQUENCE_PATTERN.test(text) ? 'emoji sequence' : null;
  };

  /**
   * Drops the spaces a line starts or ends with, and runs left empty.
   *
   * @param runs - A line's runs.
   */
  const trimRuns = (runs: SceneRun[]): SceneRun[] => {
    const first = runs[0];
    const last = runs.at(-1);
    if (first !== undefined) {
      first.text = first.text.replace(LEADING_SPACES_PATTERN, '');
    }

    if (last !== undefined) {
      last.text = last.text.replace(TRAILING_SPACES_PATTERN, '');
    }

    return runs.filter((run) => run.text !== '');
  };

  /**
   * The list marker of a list item: the materialized `::before` it carries, as a drawn shape or as
   * text.
   *
   * @param item - A `<li>`.
   * @param opacity - Its effective opacity.
   */
  const readBullet = (item: Element, opacity: number): SceneBullet | null => {
    const marker = Array.from(item.children).find(
      (child) => child.getAttribute(PSEUDO_ATTRIBUTE) === 'before',
    );
    if (marker === undefined) {
      return null;
    }

    marker.setAttribute(BULLET_ATTRIBUTE, '');
    const style = getComputedStyle(marker);
    const rect = toRect(marker.getBoundingClientRect());
    const text = (marker.textContent ?? '').trim();
    if (text !== '') {
      return { kind: 'text', text, style: runStyle(marker, opacity), left: rect.x };
    }

    if (alphaOf(style.backgroundColor) === 0 || rect.width === 0) {
      return null;
    }

    return {
      kind: 'shape',
      rect,
      color: toHex(style.backgroundColor, opacity),
      radius: readRadii(style, rect)[0],
    };
  };

  /**
   * The text alignment, with logical values resolved for left-to-right text.
   *
   * @param style - The computed style.
   */
  const alignOf = (style: CSSStyleDeclaration): SceneParagraph['align'] => {
    const align = style.textAlign;
    if (align === 'center' || align === '-webkit-center') {
      return 'center';
    }

    if (align === 'right' || align === 'end' || align === '-webkit-right') {
      return 'right';
    }

    return align === 'justify' ? 'justify' : 'left';
  };

  /**
   * The content box of an element: its border box without borders and padding.
   *
   * @param rect - The border box.
   * @param style - The computed style.
   */
  const contentBox = (rect: SceneRect, style: CSSStyleDeclaration): SceneRect => {
    const left = px(style.borderLeftWidth) + px(style.paddingLeft);
    const right = px(style.borderRightWidth) + px(style.paddingRight);
    const top = px(style.borderTopWidth) + px(style.paddingTop);
    const bottom = px(style.borderBottomWidth) + px(style.paddingBottom);
    return {
      x: round(rect.x + left),
      y: round(rect.y + top),
      width: round(Math.max(0, rect.width - left - right)),
      height: round(Math.max(0, rect.height - top - bottom)),
    };
  };

  /**
   * A paragraph for an element that holds text, or `null` when it holds none of its own.
   *
   * @param element - The element.
   * @param style - Its computed style.
   * @param rect - Its box.
   * @param opacity - Its effective opacity.
   */
  const readParagraph = (
    element: Element,
    style: CSSStyleDeclaration,
    rect: SceneRect,
    opacity: number,
  ): SceneParagraph | null => {
    const bullet = element.tagName === 'LI' ? readBullet(element, opacity) : null;
    const lines = readLines(element);
    if (lines.length === 0) {
      return null;
    }

    const lineHeight =
      style.lineHeight === 'normal'
        ? round((lines[0]?.ascent ?? 0) + (lines[0]?.descent ?? 0))
        : round(px(style.lineHeight) * elementScale(element));
    let level = 0;
    for (let node = element.parentElement; node !== null && node !== slide;) {
      if (node.tagName === 'UL' || node.tagName === 'OL') {
        level += 1;
      }

      node = node.parentElement;
    }

    const align = alignOf(style);
    const box = contentBox(rect, style);
    const textLeft =
      align === 'left' || align === 'justify' ? Math.min(...lines.map((line) => line.left)) : box.x;
    const inTable = element.closest('td, th') !== null;
    return {
      lines,
      step: stepOf(element),
      replacedAt: replacedAtOf(element),
      align,
      box,
      lineHeight,
      bullet,
      level: Math.max(0, level - 1),
      ...wrapFit(element, style, box, lines, textLeft, inTable),
    };
  };

  /**
   * Whether an element holds text of its own: a text node, directly or through inline elements.
   *
   * @param element - The element.
   */
  const hasOwnText = (element: Element): boolean => {
    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim() !== '') {
        return true;
      }

      if (
        child instanceof HTMLElement &&
        !child.hasAttribute(BULLET_ATTRIBUTE) &&
        isInline(child) &&
        hasOwnText(child)
      ) {
        return true;
      }
    }

    return false;
  };

  /**
   * The drawable elements of an inline SVG with their matrices to canvas pixels, or `null` when it
   * has parts PowerPoint geometry cannot draw.
   *
   * @param svg - The SVG root.
   * @param opacity - Its effective opacity.
   */
  const readVectorShapes = (svg: SVGSVGElement, opacity: number): RawVectorShape[] | null => {
    const shapes: RawVectorShape[] = [];
    for (const element of Array.from(svg.querySelectorAll('*'))) {
      const tag = element.tagName.toLowerCase();
      if (SVG_STRUCTURE_TAGS.has(tag)) {
        continue;
      }

      if (!VECTOR_TAGS.has(tag) || !(element instanceof SVGGraphicsElement)) {
        return null;
      }

      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility !== 'visible') {
        continue;
      }

      const usesPaintServer = style.fill.startsWith('url(') || style.stroke.startsWith('url(');
      const hasEffects =
        style.filter !== 'none' || style.clipPath !== 'none' || style.mask !== 'none';
      const isDashed = style.strokeDasharray !== 'none' && style.strokeDasharray !== '';
      if (usesPaintServer || hasEffects || isDashed) {
        return null;
      }

      const screen = element.getScreenCTM();
      if (screen === null) {
        continue;
      }

      const matrix: RawVectorShape['matrix'] = [
        screen.a / scale,
        screen.b / scale,
        screen.c / scale,
        screen.d / scale,
        (screen.e - canvasRect.left) / scale,
        (screen.f - canvasRect.top) / scale,
      ];
      const attrs: Record<string, string> = {};
      for (const attribute of Array.from(element.attributes)) {
        attrs[attribute.name] = attribute.value;
      }

      const elementOpacity =
        opacity *
        (effectiveOpacity(element) / Math.max(effectiveOpacity(svg), MIN_OPACITY_DIVISOR));
      const unit = Math.sqrt(Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2]));
      shapes.push({
        tag,
        attrs,
        matrix,
        fill:
          style.fill === 'none'
            ? null
            : toHex(style.fill, elementOpacity * (Number(style.fillOpacity) || 0)),
        stroke:
          style.stroke === 'none'
            ? null
            : toHex(style.stroke, elementOpacity * (Number(style.strokeOpacity) || 0)),
        strokeWidth: round(px(style.strokeWidth) * unit),
        cap: style.strokeLinecap,
        join: style.strokeLinejoin,
        evenOdd: style.fillRule === 'evenodd',
      });
    }

    return shapes;
  };

  /**
   * Standalone SVG markup for an inline SVG, with computed paint inlined so it renders the same
   * outside the page.
   *
   * @param svg - The SVG root.
   * @param rect - Its box.
   */
  const svgMarkup = (svg: SVGSVGElement, rect: SceneRect): string => {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const originals = [svg, ...Array.from(svg.querySelectorAll('*'))];
    const copies = [clone, ...Array.from(clone.querySelectorAll('*'))];
    const properties = [
      'fill',
      'fill-opacity',
      'stroke',
      'stroke-width',
      'stroke-opacity',
      'stroke-linecap',
      'stroke-linejoin',
      'opacity',
      'color',
      'font-family',
      'font-size',
      'font-weight',
    ];
    originals.forEach((original, index) => {
      const copy = copies[index];
      if (copy === undefined) {
        return;
      }

      const style = getComputedStyle(original);
      for (const property of properties) {
        (copy as SVGElement).style.setProperty(property, style.getPropertyValue(property));
      }
    });
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(rect.width));
    clone.setAttribute('height', String(rect.height));
    clone.removeAttribute('class');
    return new XMLSerializer().serializeToString(clone);
  };

  /**
   * A table's grid and cells as rendered.
   *
   * @param table - The table element.
   * @param opacity - Its effective opacity.
   */
  const readTable = (
    table: HTMLTableElement,
    opacity: number,
  ): { columns: number[]; rows: { height: number; cells: SceneCell[] }[] } => {
    const rows = Array.from(table.rows);
    const edges = new Set<number>();
    for (const row of rows) {
      for (const cell of Array.from(row.cells)) {
        const box = toRect(cell.getBoundingClientRect());
        edges.add(Math.round(box.x));
        edges.add(Math.round(box.x + box.width));
      }
    }

    const sortedEdges = [...edges].sort((a, b) => a - b);
    const columns = sortedEdges.slice(1).map((edge, index) => edge - (sortedEdges[index] ?? 0));
    return {
      columns,
      rows: rows.map((row) => ({
        height: toRect(row.getBoundingClientRect()).height,
        cells: Array.from(row.cells).map((cell) => {
          const style = getComputedStyle(cell);
          const box = toRect(cell.getBoundingClientRect());
          const paragraphs = cellParagraphs(cell, opacity);
          const fill =
            alphaOf(style.backgroundColor) > 0 ? toHex(style.backgroundColor, opacity) : null;
          return {
            rect: box,
            paragraphs,
            fill,
            borders: [
              readBorder(style, 'Top', opacity),
              readBorder(style, 'Right', opacity),
              readBorder(style, 'Bottom', opacity),
              readBorder(style, 'Left', opacity),
            ],
            padding: [
              px(style.paddingTop),
              px(style.paddingRight),
              px(style.paddingBottom),
              px(style.paddingLeft),
            ],
            colSpan: cell.colSpan,
            rowSpan: cell.rowSpan,
            header: cell.tagName === 'TH',
            verticalAlign: verticalAlignOf(style.verticalAlign),
          };
        }),
      })),
    };
  };

  /**
   * A cell's vertical alignment.
   *
   * @param value - The computed `vertical-align`.
   */
  const verticalAlignOf = (value: string): SceneCell['verticalAlign'] => {
    if (value === 'middle' || value === 'bottom') {
      return value;
    }

    return 'top';
  };

  /**
   * The paragraphs of a table cell: the cell itself when it holds text, else its block children.
   *
   * @param cell - The cell.
   * @param opacity - Its effective opacity.
   */
  const cellParagraphs = (cell: Element, opacity: number): SceneParagraph[] => {
    const blocks = [cell, ...Array.from(cell.querySelectorAll('*'))].filter(
      (element) => !isInline(element) && hasOwnText(element),
    );
    return blocks.flatMap((block) => {
      const style = getComputedStyle(block);
      const paragraph = readParagraph(block, style, toRect(block.getBoundingClientRect()), opacity);
      return paragraph === null ? [] : [paragraph];
    });
  };

  const roots: Element[] = [
    slide,
    ...Array.from(canvasElement.children).filter(
      (child) => child.tagName !== 'SECTION' && !child.hasAttribute('data-deck-interactive'),
    ),
  ];
  materializePseudoElements(roots);
  const placeholderSelectors = options.placeholderSelectors;
  let background: ScenePaint | null = null;
  let backgroundIsImage = false;
  let documentIndex = 0;
  const documentIndexes = new WeakMap<Element, number>();

  /**
   * Compares two paint order keys element by element; a key that is a prefix of another paints
   * first.
   *
   * @param a - A key.
   * @param b - Another.
   */
  const compareKeys = (a: readonly number[], b: readonly number[]): number => {
    for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
      const difference = (a[index] ?? 0) - (b[index] ?? 0);
      if (difference !== 0) {
        return difference;
      }
    }

    return a.length - b.length;
  };
  const pending: { node: CollectedNode; layer: number[]; index: number }[] = [];

  /**
   * Records a node with its paint order.
   *
   * @param node - The node.
   * @param layer - Its paint layer.
   * @param index - Its document position.
   */
  const record = (node: CollectedNode, layer: number[], index: number): void => {
    pending.push({ node, layer, index });
  };

  /**
   * Records one element and visits its children, depth first.
   *
   * @param element - The element.
   * @param parent - The id of the nearest recorded ancestor.
   * @param container - The id of the nearest painted ancestor.
   */
  const visit = (element: Element, parent: number | null, container: number | null): void => {
    const style = getComputedStyle(element);
    const isSkipped = SKIPPED_TAGS.has(element.tagName.toUpperCase()) || style.display === 'none';
    if (
      isSkipped ||
      element.hasAttribute(BULLET_ATTRIBUTE) ||
      element.matches('[data-slide-error]')
    ) {
      return;
    }

    const bounds = element.getBoundingClientRect();
    const opacity = effectiveOpacity(element);
    const isVisuallyHidden =
      style.clipPath === 'inset(50%)' ||
      style.getPropertyValue('clip') === 'rect(0px, 0px, 0px, 0px)' ||
      (bounds.width <= 1 && bounds.height <= 1 && style.overflow === 'hidden');
    const isVisible =
      style.visibility === 'visible' &&
      (bounds.width > 0 || bounds.height > 0) &&
      opacity > 0 &&
      !isVisuallyHidden;
    const id = documentIndex;
    documentIndexes.set(element, id);
    documentIndex += 1;
    tree[String(id)] = parent;
    if (!isVisible || style.display === 'contents') {
      if (opacity > 0 && !isVisuallyHidden) {
        visitChildren(element, parent, container);
      }

      return;
    }

    element.setAttribute(ID_ATTRIBUTE, String(id));
    const rect = toRect(bounds);
    const layer = paintLayer(element);
    const inBackdrop = element.closest(BACKDROP_SELECTOR) !== null;
    const inSlideImage = inBackdrop && element.closest(SLIDE_IMAGE_SELECTOR) !== null;
    const base = {
      id,
      parent,
      rect,
      selector: selectorFor(element),
      order: 0,
      opacity,
      hints: readHints(element, style),
      slot: slotOf(element),
      step: stepOf(element),
      replacedAt: replacedAtOf(element),
      ...(inBackdrop ? { backdrop: true as const } : {}),
      ...(inSlideImage ? { slideImage: true as const } : {}),
    };
    const chartSpec = element.getAttribute(CHART_ATTRIBUTE);
    const diagramSpec = element.getAttribute(DIAGRAM_ATTRIBUTE);
    if (chartSpec !== null || diagramSpec !== null) {
      record(
        {
          ...base,
          kind: chartSpec === null ? 'diagram-spec' : 'chart-spec',
          spec: chartSpec ?? diagramSpec ?? '',
        },
        layer,
        id + FIGURE_OFFSET,
      );
    }

    if (element instanceof SVGSVGElement) {
      const svgRadii = readRadii(style, rect);
      record(
        {
          ...base,
          kind: 'svg',
          markup: svgMarkup(element, rect),
          shapes: readVectorShapes(element, opacity),
          href: hrefOf(element),
          ...(element.closest(DIAGRAM_ICON_SELECTOR) === null ? {} : { diagramIcon: true }),
          ...(svgRadii.some((radius) => radius > 0) ? { radii: svgRadii } : {}),
        },
        layer,
        id,
      );
      return;
    }

    if (element instanceof SVGElement) {
      return;
    }

    if (element instanceof HTMLImageElement) {
      const clip = clipOf(element, rect);
      const fitted = objectCrop(element, rect, style);
      const visible = clipRect(fitted.rect, clip.rect);
      const crop = addCrop(fitted.crop, fitted.rect, visible);
      const ownRadii = readRadii(style, rect);
      const src = element.currentSrc === '' ? element.src : element.currentSrc;
      record(
        {
          ...base,
          rect: visible,
          kind: 'image',
          src,
          alt: element.alt,
          natural: { width: element.naturalWidth, height: element.naturalHeight },
          crop,
          radii: ownRadii.some((radius) => radius > 0) ? ownRadii : (clip.radii ?? ownRadii),
          vector: SVG_SOURCE_PATTERN.test(src),
          grayscale: style.filter === 'grayscale(1)',
          href: hrefOf(element),
          ...(element.closest(DIAGRAM_ICON_SELECTOR) === null ? {} : { diagramIcon: true }),
        },
        layer,
        id,
      );
      return;
    }

    if (element instanceof HTMLVideoElement) {
      record(
        {
          ...base,
          kind: 'media',
          media: 'video',
          poster: element.poster === '' ? null : element.poster,
          src: element.currentSrc === '' ? null : element.currentSrc,
          href: null,
        },
        layer,
        id,
      );
      return;
    }

    if (element instanceof HTMLTableElement) {
      const table = readTable(element, opacity);
      record({ ...base, kind: 'table', ...table }, layer, id);
      // What cells draw besides text (an inline bar, a dot) goes over the table as boxes.
      for (const inner of Array.from(element.querySelectorAll('td *, th *'))) {
        const innerStyle = getComputedStyle(inner);
        const { fill } = readFill(innerStyle, effectiveOpacity(inner));
        const innerRect = toRect(inner.getBoundingClientRect());
        if (fill === null || innerRect.width < 1 || innerRect.height < 1) {
          continue;
        }

        const innerId = documentIndex;
        documentIndex += 1;
        tree[String(innerId)] = id;
        inner.setAttribute(ID_ATTRIBUTE, String(innerId));
        record(
          {
            ...base,
            id: innerId,
            parent: id,
            rect: innerRect,
            selector: selectorFor(inner),
            hints: [],
            kind: 'box',
            fill,
            borders: [null, null, null, null],
            radii: readRadii(innerStyle, innerRect),
            shadows: [],
            fullBleed: false,
          },
          layer,
          id + TABLE_CONTENT_OFFSET,
        );
      }

      return;
    }

    const { fill, hints: fillHints, image } = readFill(style, opacity);
    const borders: [
      SceneBorder | null,
      SceneBorder | null,
      SceneBorder | null,
      SceneBorder | null,
    ] = [
      readBorder(style, 'Top', opacity),
      readBorder(style, 'Right', opacity),
      readBorder(style, 'Bottom', opacity),
      readBorder(style, 'Left', opacity),
    ];
    const shadows = readShadows(style.boxShadow, opacity);
    const paints =
      fill !== null || image || borders.some((border) => border !== null) || shadows.length > 0;
    const hints = [...base.hints, ...fillHints];
    // A translucent box over the whole slide, such as a scrim over a photo, shows what is under it:
    // it is an overlay, never the slide's background.
    const fullBleed =
      !inBackdrop &&
      rect.x <= FULL_BLEED_TOLERANCE_PX &&
      rect.y <= FULL_BLEED_TOLERANCE_PX &&
      rect.x + rect.width >= canvas.width - FULL_BLEED_TOLERANCE_PX &&
      rect.y + rect.height >= canvas.height - FULL_BLEED_TOLERANCE_PX &&
      (image || fill === null || isOpaquePaint(fill));
    if (paints || hints.length > 0) {
      if (fullBleed && (fill !== null || image)) {
        background = fill;
        backgroundIsImage = image;
      }

      record(
        {
          ...base,
          hints,
          kind: 'box',
          fill,
          borders,
          radii: readRadii(style, rect),
          shadows,
          fullBleed,
        },
        layer,
        isInline(element) && parent !== null ? parent + INLINE_BOX_OFFSET : id,
      );
    }

    const isMediaFrame = element.matches('.kit-video, .kit-app, .kit-live');
    if (isMediaFrame) {
      const poster = element.querySelector('img');
      record(
        {
          ...base,
          id: id + MEDIA_ID_OFFSET,
          kind: 'media',
          media: element.matches('.kit-video') ? 'video' : 'app',
          poster: poster === null ? null : poster.currentSrc || poster.src,
          src: null,
          href: null,
          radii: mediaRadii(style, rect, poster),
        },
        layer,
        id,
      );
    }

    const nextContainer = paints ? id : container;
    if (element.matches(CODE_SELECTOR)) {
      const paragraphs = readCode(element);
      if (paragraphs.length > 0) {
        record(
          {
            ...base,
            id: id + TEXT_ID_OFFSET,
            parent: id,
            hints: [],
            kind: 'text',
            paragraphs,
            container: nextContainer,
            matches: placeholderSelectors.filter((selector) => element.closest(selector) !== null),
          },
          // The code's text paints over its lines' highlights, which are positioned inside it.
          [...layer.slice(0, -1), CODE_TEXT_LAYER],
          id + TEXT_ID_OFFSET,
        );
      }
    } else if (
      !isInline(element) &&
      element.closest(CODE_SELECTOR) === null &&
      hasOwnText(element)
    ) {
      const paragraph = readParagraph(element, style, rect, opacity);
      const complex = paragraph === null ? null : complexText(element, style);
      if (paragraph !== null) {
        record(
          {
            ...base,
            id: id + TEXT_ID_OFFSET,
            parent: id,
            hints:
              complex === null
                ? []
                : [{ reason: 'complex-text', scope: 'subtree', detail: complex }],
            kind: 'text',
            paragraphs: [paragraph],
            container: nextContainer,
            matches: placeholderSelectors.filter((selector) => element.closest(selector) !== null),
          },
          layer,
          id + TEXT_ID_OFFSET,
        );
      }
    }

    visitChildren(element, id, nextContainer);
  };

  /**
   * Visits an element's children.
   *
   * @param element - The element.
   * @param parent - The id of the nearest recorded ancestor.
   * @param container - The id of the nearest painted ancestor.
   */
  const visitChildren = (
    element: Element,
    parent: number | null,
    container: number | null,
  ): void => {
    for (const child of Array.from(element.children)) {
      if (
        child instanceof HTMLElement &&
        isInline(child) &&
        !child.hasAttribute(PSEUDO_ATTRIBUTE)
      ) {
        const style = getComputedStyle(child);
        const paintsInline =
          alphaOf(style.backgroundColor) > 0 ||
          style.borderTopStyle !== 'none' ||
          style.boxShadow !== 'none';
        if (!paintsInline) {
          visitInline(child, parent, container);
          continue;
        }
      }

      visit(child, parent, container);
    }
  };

  /**
   * Visits the non-inline descendants of an inline element (its text belongs to the enclosing
   * paragraph), such as an image inside a link.
   *
   * @param element - The inline element.
   * @param parent - The id of the nearest recorded ancestor.
   * @param container - The id of the nearest painted ancestor.
   */
  const visitInline = (element: Element, parent: number | null, container: number | null): void => {
    documentIndex += 1;
    for (const child of Array.from(element.children)) {
      if (child instanceof HTMLElement && isInline(child)) {
        visitInline(child, parent, container);
      } else {
        visit(child, parent, container);
      }
    }
  };

  /**
   * The corner radii a media frame shows its poster with: the frame's own, else the poster's, else
   * those of the element that clips it.
   *
   * @param style - The frame's computed style.
   * @param rect - Its box.
   * @param poster - The poster image, if any.
   */
  const mediaRadii = (
    style: CSSStyleDeclaration,
    rect: SceneRect,
    poster: HTMLImageElement | null,
  ): [number, number, number, number] => {
    const own = readRadii(style, rect);
    if (own.some((radius) => radius > 0) || poster === null) {
      return own;
    }

    const posterRect = toRect(poster.getBoundingClientRect());
    const posterRadii = readRadii(getComputedStyle(poster), posterRect);
    if (posterRadii.some((radius) => radius > 0)) {
      return posterRadii;
    }

    return clipOf(poster, posterRect).radii ?? own;
  };

  /**
   * The part of a box inside a clip rectangle.
   *
   * @param box - The box.
   * @param clip - The clip.
   */
  const clipRect = (box: SceneRect, clip: SceneRect): SceneRect => {
    const left = Math.max(box.x, clip.x);
    const top = Math.max(box.y, clip.y);
    const right = Math.min(box.x + box.width, clip.x + clip.width);
    const bottom = Math.min(box.y + box.height, clip.y + clip.height);
    return {
      x: round(left),
      y: round(top),
      width: round(Math.max(0, right - left)),
      height: round(Math.max(0, bottom - top)),
    };
  };

  /**
   * Adds the crop a clip makes to an `object-fit` crop.
   *
   * @param crop - The crop from `object-fit`, as fractions of the image.
   * @param drawn - The box the visible image fills before the clip.
   * @param visible - The box after the clip.
   */
  const addCrop = (
    crop: { left: number; top: number; right: number; bottom: number },
    drawn: SceneRect,
    visible: SceneRect,
  ): { left: number; top: number; right: number; bottom: number } => {
    if (drawn.width === 0 || drawn.height === 0) {
      return crop;
    }

    const shownX = 1 - crop.left - crop.right;
    const shownY = 1 - crop.top - crop.bottom;
    const cutLeft = ((visible.x - drawn.x) / drawn.width) * shownX;
    const cutTop = ((visible.y - drawn.y) / drawn.height) * shownY;
    const cutRight = ((drawn.x + drawn.width - visible.x - visible.width) / drawn.width) * shownX;
    const cutBottom =
      ((drawn.y + drawn.height - visible.y - visible.height) / drawn.height) * shownY;
    return {
      left: round(crop.left + cutLeft),
      top: round(crop.top + cutTop),
      right: round(crop.right + cutRight),
      bottom: round(crop.bottom + cutBottom),
    };
  };

  for (const root of roots) {
    visit(root, null, null);
  }

  for (const anchor of Array.from(canvasElement.querySelectorAll('a[href]'))) {
    const inActive = slide.contains(anchor) || !anchor.closest('section');
    if (!inActive) {
      continue;
    }

    for (const rect of Array.from(anchor.getClientRects())) {
      if (rect.width > 0 && rect.height > 0) {
        links.push({ rect: toRect(rect), href: anchor.getAttribute('href') ?? '' });
      }
    }
  }

  pending.sort((a, b) => compareKeys([...a.layer, a.index], [...b.layer, b.index]));
  pending.forEach((entry, order) => {
    entry.node.order = order;
    nodes.push(entry.node);
  });
  return { ...empty, background, backgroundIsImage };
}

/**
 * Puts the page's pseudo-elements back: removes the elements that stood in for them while the scene
 * was measured, so pictures of elements are taken as the slide really renders (child selectors such
 * as `:first-child` match as they do without the stand-ins). The `data-export-id` markers stay for
 * those pictures. It runs inside the browser and is self-contained.
 */
export function releasePseudoElements(): void {
  for (const element of Array.from(document.querySelectorAll('[data-export-pseudo]'))) {
    element.remove();
  }

  for (const element of Array.from(document.querySelectorAll('[data-export-pseudo-host]'))) {
    element.removeAttribute('data-export-pseudo-host');
  }

  document.getElementById('deck-export-pseudo-style')?.remove();
}

/**
 * Undoes what {@link collectScene} changed in the page: removes the `data-export-*` markers and the
 * elements that stood in for pseudo-elements. It runs inside the browser and is self-contained.
 */
export function releaseScene(): void {
  for (const element of Array.from(document.querySelectorAll('[data-export-pseudo]'))) {
    element.remove();
  }

  for (const attribute of ['data-export-id', 'data-export-pseudo-host', 'data-export-bullet']) {
    for (const element of Array.from(document.querySelectorAll(`[${attribute}]`))) {
      element.removeAttribute(attribute);
    }
  }

  document.getElementById('deck-export-pseudo-style')?.remove();
}
