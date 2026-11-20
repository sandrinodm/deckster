import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

import type { MotionTokens } from '#diagrams/packet-motion.ts';

import {
  DIAGRAM_ALIGNS,
  DIAGRAM_LINE_STYLES,
  DIAGRAM_TEXT_STEPS,
  type DiagramAlign,
  type DiagramLineStyle,
  type DiagramTextStep,
} from '#diagrams/diagram-design.ts';
import {
  ACCENT_SIDES,
  CARD_ICONS,
  CARD_SHAPES,
  DEFAULT_CARD,
  cardVariables,
  isCardName,
  type CardSource,
  type CardTokens,
} from '#diagrams/node-cards.ts';
import { NODE_KIND_NAMES } from '#diagrams/node-kinds.ts';
import { cssDurationMs } from '#motion/css-duration.ts';

/**
 * How edges turn their corners: rounded (the default) or square.
 */
export const EDGE_CORNERS = ['round', 'sharp'] as const;

/**
 * The arrowheads an edge can end in: a filled triangle (the default), an open chevron, or a dot.
 */
export const ARROW_STYLES = ['triangle', 'open', 'dot'] as const;

/**
 * One of {@link ARROW_STYLES}.
 */
export type ArrowStyle = (typeof ARROW_STYLES)[number];

/**
 * How edge labels are set: on a knock-out (the default) or in a bordered chip.
 */
export const LABEL_STYLES = ['plain', 'chip'] as const;

/**
 * One of {@link LABEL_STYLES}.
 */
export type LabelStyle = (typeof LABEL_STYLES)[number];

/**
 * The type step edge labels are set in: the caption step (the default) or the brand's label step.
 */
export const LABEL_TYPES = ['caption', 'label'] as const;

/**
 * One of {@link LABEL_TYPES}.
 */
export type LabelType = (typeof LABEL_TYPES)[number];

/**
 * The most card names read from a brand; the brand package allows fewer.
 */
const MAX_CARDS = 32;

/**
 * Splits a list of names at its whitespace.
 */
const WHITESPACE = /\s+/;

/**
 * The brand values a diagram is drawn with, read from the brand's custom properties on the
 * diagram's element, so they follow the slide's brand and surface. Sizes are canvas pixels and
 * durations milliseconds.
 */
export type DiagramTokens = {
  /**
   * Durations and the standard easing.
   */
  motion: MotionTokens;

  /**
   * Corner radii: `md` for nodes, `lg` for groups and edge corners.
   */
  radius: { sm: number; md: number; lg: number };

  /**
   * Line widths.
   */
  stroke: { hairline: number; regular: number; bold: number };

  /**
   * Spacing steps.
   */
  space: { xs: number; sm: number; md: number; lg: number; xl: number };

  /**
   * Type sizes, for sizing boxes around text.
   */
  type: { caption: number; label: number };

  /**
   * The width of a string set in the caption step (edge labels, packet tags), in canvas pixels,
   * measured with the brand's font before anything is laid out; without a canvas, an estimate.
   */
  measureCaption: (text: string) => number;

  /**
   * The width of a string set as a node title (the small step in the title family), in canvas
   * pixels, measured the same way; without a canvas, an estimate.
   */
  measureTitle: (text: string) => number;

  /**
   * The width of a string set in the label step (badges), in the step's case and letter spacing, in
   * canvas pixels, measured the same way; without a canvas, an estimate.
   */
  measureLabel: (text: string) => number;

  /**
   * The brand's cards (node styles) and the card each node kind maps to; no cards for a stylesheet
   * without card variables, whose nodes keep today's look.
   */
  cards: CardSource;

  /**
   * How edges are drawn: the line width in canvas pixels, whether corners are rounded or square,
   * and the arrowhead.
   */
  edge: {
    stroke: number;
    corners: (typeof EDGE_CORNERS)[number];
    arrow: ArrowStyle;
    lineStyle?: DiagramLineStyle | undefined;

    /**
     * An explicit numeric stroke for timeline axes, which otherwise use the regular stroke.
     */
    timelineStroke?: number | undefined;
  };

  /**
   * The explicit horizontal placement, when a brand chooses one.
   */
  align?: DiagramAlign | undefined;

  /**
   * Preferred width and minimum height, in canvas pixels (0 keeps intrinsic sizing).
   */
  node: { width: number; height: number };

  /**
   * The step used by all node subtitles and supporting notes.
   */
  text: { subtitle: DiagramTextStep; note: DiagramTextStep };

  /**
   * Width of subtitle text using the diagram's font, in canvas pixels.
   */
  measureSubtitle: (text: string) => number;

  /**
   * How groups are drawn: the outline's width (0 for none), whether it is dashed, and the corner
   * radius, in canvas pixels.
   */
  group: {
    stroke: number;
    dashed: boolean;
    radius: number;
    lineStyle?: DiagramLineStyle | undefined;
  };

  /**
   * How edge labels are set.
   */
  label: { style: LabelStyle; type: LabelType };

  /**
   * The width of an edge or message label's text in the step labels are set in (the caption step,
   * or the label step for a brand that sets them there), in canvas pixels: every measure that sizes
   * or places a label uses it.
   */
  measureEdgeLabel: (text: string) => number;
};

/**
 * The average width of a character as a share of the font size, when no canvas can measure it.
 */
const ESTIMATED_CHAR_WIDTH = 0.55;

/**
 * The average width of a capital with the label step's letter spacing as a share of the font size,
 * when no canvas can measure it.
 */
const ESTIMATED_LABEL_CHAR_WIDTH = 0.8;

/**
 * The default brand's caption size in canvas pixels, which the caption estimate uses.
 */
const FALLBACK_CAPTION_SIZE = 24;

/**
 * The default brand's node title size in canvas pixels, which the title estimate uses.
 */
const FALLBACK_TITLE_SIZE = 26;

/**
 * An estimate of a node title's width for the default brand's small step.
 *
 * @param text - The title.
 */
function estimateTitle(text: string): number {
  return text.length * FALLBACK_TITLE_SIZE * ESTIMATED_CHAR_WIDTH;
}

/**
 * The geometry of today's node, which a node takes when the brand defines no card: the regular
 * line, the medium radius, the kind's shape and a bordered icon tile, no accent and no shadow.
 *
 * @param steps - The brand's radius and stroke steps.
 * @param measureTitle - The node title measure.
 */
function plainCard(
  steps: Pick<DiagramTokens, 'radius' | 'stroke'>,
  measureTitle: (text: string) => number,
): CardTokens {
  return {
    name: DEFAULT_CARD,
    stroke: steps.stroke.regular,
    radius: steps.radius.md,
    shape: 'kind',
    icon: 'chip',
    accent: { side: 'none', width: steps.stroke.bold },
    shadow: false,
    nodeFill: true,
    titleOwn: false,
    measureTitle,
  };
}

/**
 * Values used when a token is missing, which only happens outside a deck (unit tests).
 */
export const FALLBACK: DiagramTokens = {
  /**
   * The default brand's durations and standard easing.
   */
  motion: { fast: 160, base: 280, slow: 480, easing: [0.2, 0, 0, 1] },

  /**
   * The default brand's radii.
   */
  radius: { sm: 6, md: 12, lg: 20 },

  /**
   * The default brand's line widths.
   */
  stroke: { hairline: 1, regular: 2, bold: 4 },

  /**
   * The default brand's spacing steps.
   */
  space: { xs: 8, sm: 16, md: 24, lg: 40, xl: 64 },

  /**
   * The default brand's caption and label sizes.
   */
  type: { caption: FALLBACK_CAPTION_SIZE, label: 22 },

  /**
   * An estimate: an average character is a little over half the caption size.
   */
  measureCaption: (text) => text.length * FALLBACK_CAPTION_SIZE * ESTIMATED_CHAR_WIDTH,

  /**
   * An estimate for the default brand's small step.
   */
  measureTitle: estimateTitle,

  /**
   * An estimate: label text is set in capitals, wider than an average character.
   */
  measureLabel: (text) => text.length * 22 * ESTIMATED_LABEL_CHAR_WIDTH,

  /**
   * No cards: every node is today's node.
   */
  cards: {
    cards: new Map(),
    kinds: new Map(),
    fallback: plainCard(
      { radius: { sm: 6, md: 12, lg: 20 }, stroke: { hairline: 1, regular: 2, bold: 4 } },
      estimateTitle,
    ),
  },

  /**
   * Today's edges: the regular line, rounded corners, a filled arrowhead.
   */
  edge: { stroke: 2, corners: 'round', arrow: 'triangle' },

  /**
   * With no explicit dimensions, the layout uses its intrinsic sizes.
   */
  node: { width: 0, height: 0 },

  /**
   * Both types of supporting text use the caption step.
   */
  text: { subtitle: 'caption', note: 'caption' },

  /**
   * Estimate subtitle widths as captions without a live document.
   */
  measureSubtitle: (text) => text.length * FALLBACK_CAPTION_SIZE * ESTIMATED_CHAR_WIDTH,

  /**
   * Today's groups: a hairline, solid, with the large radius.
   */
  group: { stroke: 1, dashed: false, radius: 20 },

  /**
   * Today's edge labels, on a knock-out.
   */
  label: { style: 'plain', type: 'caption' },

  /**
   * Labels in the caption step, as the caption estimate.
   */
  measureEdgeLabel: (text) => text.length * FALLBACK_CAPTION_SIZE * ESTIMATED_CHAR_WIDTH,
};

/**
 * A 2D context for measuring text, created on first use; `null` where there is no canvas.
 */
let measuring: CanvasRenderingContext2D | null | undefined;

/**
 * A function that measures text with the font the element's brand sets for a kind of diagram text:
 * the font is read from a probe (`classes`, outermost first, nested inside the element), the width
 * from a canvas, plus the step's letter spacing.
 *
 * @param element - An element on the slide.
 * @param classes - The class names of the probe's elements, outermost first.
 * @param size - The type size, for the estimate when there is no canvas.
 * @param variables - Custom properties set on the probe's outermost element, such as a card's.
 */
function textMeasurer(
  element: Element,
  classes: readonly string[],
  size: number,
  variables: Readonly<Record<string, string>> = {},
): (text: string) => number {
  /**
   * The estimate used without a canvas.
   */
  const estimate = (text: string): number => text.length * size * ESTIMATED_CHAR_WIDTH;
  if (typeof document === 'undefined') {
    return estimate;
  }

  measuring ??= document.createElement('canvas').getContext('2d');
  const context = measuring;
  if (context === null) {
    return estimate;
  }

  const outer = document.createElement('div');
  outer.style.position = 'absolute';
  outer.style.visibility = 'hidden';
  let probe: HTMLElement = outer;
  for (const name of classes) {
    const inner = document.createElement('span');
    inner.className = name;
    probe.append(inner);
    probe = inner;
  }

  const first = outer.firstElementChild;
  if (first instanceof HTMLElement) {
    for (const [variable, value] of Object.entries(variables)) {
      first.style.setProperty(variable, value);
    }
  }

  probe.textContent = 'x';
  element.append(outer);
  const style = getComputedStyle(probe);
  const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const spacing = Number.parseFloat(style.letterSpacing) || 0;
  const upper = style.textTransform === 'uppercase';
  outer.remove();
  const widths = new Map<string, number>();
  return (text) => {
    const known = widths.get(text);
    if (known !== undefined) {
      return known;
    }

    context.font = font;
    const width =
      context.measureText(upper ? text.toUpperCase() : text).width + spacing * text.length;
    widths.set(text, width);
    return width;
  };
}

/**
 * A `cubic-bezier()` value.
 */
const BEZIER_PATTERN = /cubic-bezier\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/;

/**
 * Reads the standard easing from its `cubic-bezier()` value, or the default brand's easing when the
 * value is missing or does not hold four finite numbers.
 *
 * @param css - The computed value of the standard easing token.
 */
function readEasing(css: string): MotionTokens['easing'] {
  const match = BEZIER_PATTERN.exec(css);
  const curve = match?.slice(1, 5).map(Number);
  if (curve?.length !== 4 || !curve.every(Number.isFinite)) {
    return FALLBACK.motion.easing;
  }

  return curve as unknown as MotionTokens['easing'];
}

/**
 * Reads the brand's diagram tokens from an element's computed style.
 *
 * @param element - An element on the slide, inside the brand's scope.
 * @returns The tokens; a missing or unreadable one falls back to the default brand's value.
 */
export function readDiagramTokens(element: Element): DiagramTokens {
  const style = getComputedStyle(element);
  /**
   * A token's number, or the fallback when it is missing.
   */
  const read = (name: string, fallback: number): number => {
    const value = Number.parseFloat(style.getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  };
  const radius = {
    sm: read('--brand-radius-sm', FALLBACK.radius.sm),
    md: read('--brand-radius-md', FALLBACK.radius.md),
    lg: read('--brand-radius-lg', FALLBACK.radius.lg),
  };
  const stroke = {
    hairline: read('--brand-stroke-hairline', FALLBACK.stroke.hairline),
    regular: read('--brand-stroke-regular', FALLBACK.stroke.regular),
    bold: read('--brand-stroke-bold', FALLBACK.stroke.bold),
  };
  const smallSize = read('--brand-type-small-size', FALLBACK.type.caption);
  const measureTitle = textMeasurer(element, TITLE_PROBE, smallSize);
  const measureCaption = textMeasurer(
    element,
    ['kit-type-caption'],
    read('--brand-type-caption-size', FALLBACK.type.caption),
  );
  const measureLabel = textMeasurer(
    element,
    ['kit-type-label'],
    read('--brand-type-label-size', FALLBACK.type.label),
  );
  const subtitle = keyword(style, '--brand-diagram-subtitle-type', DIAGRAM_TEXT_STEPS, 'caption');
  const note = keyword(style, '--brand-diagram-note-type', DIAGRAM_TEXT_STEPS, 'caption');
  const timelineStroke = read('--brand-diagram-timeline-stroke', Number.NaN);
  const labelType = keyword(style, '--brand-diagram-label-type', LABEL_TYPES, 'caption');
  return {
    motion: {
      fast: cssDurationMs(style.getPropertyValue('--brand-duration-fast')) ?? FALLBACK.motion.fast,
      base: cssDurationMs(style.getPropertyValue('--brand-duration-base')) ?? FALLBACK.motion.base,
      slow: cssDurationMs(style.getPropertyValue('--brand-duration-slow')) ?? FALLBACK.motion.slow,
      easing: readEasing(style.getPropertyValue('--brand-ease-standard')),
    },
    radius,
    stroke,
    space: {
      xs: read('--brand-space-xs', FALLBACK.space.xs),
      sm: read('--brand-space-sm', FALLBACK.space.sm),
      md: read('--brand-space-md', FALLBACK.space.md),
      lg: read('--brand-space-lg', FALLBACK.space.lg),
      xl: read('--brand-space-xl', FALLBACK.space.xl),
    },
    type: {
      caption: read('--brand-type-caption-size', FALLBACK.type.caption),
      label: read('--brand-type-label-size', FALLBACK.type.label),
    },
    measureCaption,
    measureLabel,
    measureTitle,
    cards: {
      cards: readCards(element, style, { radius, stroke }, smallSize, subtitle),
      kinds: readKinds(style),
      fallback: plainCard({ radius, stroke }, measureTitle),
    },
    align: keyword(style, '--brand-diagram-align', DIAGRAM_ALIGNS),
    node: {
      width: read('--brand-diagram-node-width', 0),
      height: read('--brand-diagram-node-height', 0),
    },
    text: { subtitle, note },
    measureSubtitle: textMeasurer(element, subtitleProbe(subtitle), subtitleSize(style, subtitle)),
    edge: {
      lineStyle: keyword(style, '--brand-diagram-edge-style', DIAGRAM_LINE_STYLES),
      timelineStroke: Number.isFinite(timelineStroke) ? timelineStroke : undefined,
      stroke: read('--brand-diagram-edge-stroke', stroke.regular),
      corners: keyword(style, '--brand-diagram-edge-corners', EDGE_CORNERS, 'round'),
      arrow: keyword(style, '--brand-diagram-edge-arrow', ARROW_STYLES, 'triangle'),
    },
    group: {
      lineStyle: keyword(style, '--brand-diagram-group-style', DIAGRAM_LINE_STYLES),
      stroke: read('--brand-diagram-group-stroke', stroke.hairline),
      dashed: style.getPropertyValue('--brand-diagram-group-dashed').trim() === 'true',
      radius: read('--brand-diagram-group-radius', radius.lg),
    },
    label: {
      style: keyword(style, '--brand-diagram-label-style', LABEL_STYLES, 'plain'),
      type: labelType,
    },
    measureEdgeLabel: labelType === 'label' ? measureLabel : measureCaption,
  };
}

/**
 * The classes of the probe a node title is measured in, outermost first.
 */
const TITLE_PROBE = ['kit-flow-node', 'kit-flow-node-title kit-type-small'] as const;

/**
 * A keyword token: its value when it is one of the allowed values, else the fallback.
 *
 * @param style - The computed style holding it.
 * @param name - The custom property.
 * @param values - The allowed values.
 * @param fallback - The value when it is missing or unknown.
 */
function keyword<Value extends string>(
  style: CSSStyleDeclaration,
  name: string,
  values: readonly Value[],
): Value | undefined;

/**
 * Reads a keyword or returns a fallback when its CSS value is missing or invalid.
 */
function keyword<Value extends string>(
  style: CSSStyleDeclaration,
  name: string,
  values: readonly Value[],
  fallback: Value,
): Value;

/**
 * Checks the computed value against the supported keywords.
 */
function keyword<Value extends string>(
  style: CSSStyleDeclaration,
  name: string,
  values: readonly Value[],
  fallback?: Value,
): Value | undefined {
  const value = style.getPropertyValue(name).trim();
  return (values as readonly string[]).includes(value) ? (value as Value) : fallback;
}

/**
 * The card each node kind maps to, for the kinds the brand maps (`--brand-diagram-kind-<kind>`).
 *
 * @param style - The diagram's computed style.
 */
function readKinds(style: CSSStyleDeclaration): Map<string, string> {
  return new Map(
    NODE_KIND_NAMES.flatMap((kind) => {
      const card = style.getPropertyValue(`--brand-diagram-kind-${kind}`).trim();
      return isCardName(card) ? [[kind, card] as const] : [];
    }),
  );
}

/**
 * Reads the brand's cards: the names in `--brand-diagram-cards` (kebab names only), each with its
 * geometry from its variables, a missing one the brand's own step, and a measure for its title
 * font.
 *
 * @param element - The diagram's element, where the probes go.
 * @param style - Its computed style.
 * @param steps - The brand's radius and stroke steps.
 * @param smallSize - The small step's size, for the estimate without a canvas.
 * @param subtitle - The diagram's subtitle step, for a card without its own.
 */
function readCards(
  element: Element,
  style: CSSStyleDeclaration,
  steps: Pick<DiagramTokens, 'radius' | 'stroke'>,
  smallSize: number,
  subtitle: DiagramTextStep,
): Map<string, CardTokens> {
  const names = [
    ...new Set(style.getPropertyValue('--brand-diagram-cards').trim().split(WHITESPACE)),
  ]
    .filter(isCardName)
    .slice(0, MAX_CARDS);
  if (names.length === 0) {
    return new Map();
  }

  const cards = new Map<string, CardTokens>();
  for (const name of names) {
    /**
     * One of the card's variables.
     */
    const value = (field: string): string =>
      style.getPropertyValue(`--brand-diagram-card-${name}-${field}`).trim();
    /**
     * One of the card's lengths, or the fallback when it is missing.
     */
    const length = (field: string, fallback: number): number => {
      const parsed = Number.parseFloat(value(field));
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const shadow = value('shadow');
    const step = keyword(style, `--brand-diagram-card-${name}-subtitle-type`, DIAGRAM_TEXT_STEPS);
    const subtitleStep = step ?? subtitle;
    cards.set(name, {
      name,
      stroke: length('stroke', steps.stroke.regular),
      radius: length('radius', steps.radius.md),
      borderStyle: keyword(style, `--brand-diagram-card-${name}-border-style`, DIAGRAM_LINE_STYLES),
      iconBorder: value('icon-border-style') !== '' || value('icon-border-width') !== '',
      subtitleStep,
      measureSubtitle: lazyMeasurer(() =>
        textMeasurer(
          element,
          subtitleProbe(subtitleStep),
          subtitleSize(style, subtitleStep),
          cardVariables(name),
        ),
      ),
      shape: keyword(style, `--brand-diagram-card-${name}-shape`, CARD_SHAPES, 'kind'),
      icon: keyword(style, `--brand-diagram-card-${name}-icon`, CARD_ICONS, 'chip'),
      accent: {
        side: keyword(style, `--brand-diagram-card-${name}-accent-side`, ACCENT_SIDES, 'none'),
        width: length('accent-width', steps.stroke.bold),
      },
      shadow: shadow !== '' && shadow !== 'none',
      nodeFill: nodeFillOf(name, value('node-fill')),
      titleOwn: value('title-own') === 'true',
      measureTitle: lazyMeasurer(() =>
        textMeasurer(element, TITLE_PROBE, smallSize, cardVariables(name)),
      ),
    });
  }

  return cards;
}

/**
 * The class names for a hidden subtitle probe, with the selected brand type step.
 */
function subtitleProbe(step: DiagramTextStep): readonly string[] {
  return ['kit-flow-node', `kit-flow-node-subtitle kit-type-${step}`];
}

/**
 * The fallback size used to measure a subtitle when there is no canvas.
 */
function subtitleSize(style: CSSStyleDeclaration, step: DiagramTextStep): number {
  return (
    Number.parseFloat(style.getPropertyValue(`--brand-type-${step}-size`)) || FALLBACK_CAPTION_SIZE
  );
}

/**
 * A text measure allocated on first use, because only some of a brand's cards appear in a slide.
 */
function lazyMeasurer(build: () => (text: string) => number): (text: string) => number {
  let measure: ((text: string) => number) | undefined;
  return (text) => {
    measure ??= build();
    return measure(text);
  };
}

/**
 * Whether a card's fill is the diagram `node` colour, from its `node-fill` variable (`true` or
 * `false`); without one, only the `default` card's is.
 *
 * @param name - The card's name.
 * @param value - The variable's value; empty when it is missing.
 */
function nodeFillOf(name: string, value: string): boolean {
  return value === '' ? name === DEFAULT_CARD : value === 'true';
}

/**
 * The radius an edge's corners are rounded with: the given radius for rounded corners, 0 for a
 * brand that draws them square.
 *
 * @param tokens - The brand's values.
 * @param radius - The radius the diagram rounds corners with.
 */
export function edgeCornerRadius(tokens: Pick<DiagramTokens, 'edge'>, radius: number): number {
  return tokens.edge.corners === 'sharp' ? 0 : radius;
}

/**
 * The media query for reduced motion.
 */
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/**
 * Whether the viewer asked for reduced motion; packets then show their static still.
 */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia(REDUCED_MOTION).matches;
}

/**
 * Whether the viewer asks for reduced motion, kept current: the diagram re-renders when the setting
 * changes while the deck is open.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    if (typeof matchMedia !== 'function') {
      return undefined;
    }

    const query = matchMedia(REDUCED_MOTION);
    /**
     * Follows the setting.
     */
    const update = (): void => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

/**
 * Reads the brand's diagram tokens once a diagram's element is on the slide, and again once the
 * brand's web fonts have loaded, so text measured for the layout uses the real font.
 *
 * @param root - The diagram's element.
 * @returns The tokens; `undefined` before the element mounts.
 */
export function useDiagramTokens(root: RefObject<HTMLElement | null>): DiagramTokens | undefined {
  const [tokens, setTokens] = useState<DiagramTokens>();
  useLayoutEffect(() => {
    if (root.current !== null) {
      setTokens(readDiagramTokens(root.current));
    }
  }, [root]);
  useEffect(() => {
    const fonts = typeof document === 'undefined' ? undefined : document.fonts;
    if (fonts === undefined || fonts.status === 'loaded') {
      return undefined;
    }

    let live = true;
    void fonts.ready.then(() => {
      if (live && root.current !== null) {
        setTokens(readDiagramTokens(root.current));
      }
    });
    return () => {
      live = false;
    };
  }, [root]);
  return tokens;
}
