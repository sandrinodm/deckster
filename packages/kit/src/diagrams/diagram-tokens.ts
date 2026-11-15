import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

import type { MotionTokens } from '#diagrams/packet-motion.ts';

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
 * Values used when a token is missing, which only happens outside a deck (unit tests).
 */
const FALLBACK: DiagramTokens = {
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
  measureTitle: (text) => text.length * FALLBACK_TITLE_SIZE * ESTIMATED_CHAR_WIDTH,

  /**
   * An estimate: label text is set in capitals, wider than an average character.
   */
  measureLabel: (text) => text.length * 22 * ESTIMATED_LABEL_CHAR_WIDTH,
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
 */
function textMeasurer(
  element: Element,
  classes: readonly string[],
  size: number,
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
  return {
    motion: {
      fast: read('--brand-duration-fast', FALLBACK.motion.fast),
      base: read('--brand-duration-base', FALLBACK.motion.base),
      slow: read('--brand-duration-slow', FALLBACK.motion.slow),
      easing: readEasing(style.getPropertyValue('--brand-ease-standard')),
    },
    radius: {
      sm: read('--brand-radius-sm', FALLBACK.radius.sm),
      md: read('--brand-radius-md', FALLBACK.radius.md),
      lg: read('--brand-radius-lg', FALLBACK.radius.lg),
    },
    stroke: {
      hairline: read('--brand-stroke-hairline', FALLBACK.stroke.hairline),
      regular: read('--brand-stroke-regular', FALLBACK.stroke.regular),
      bold: read('--brand-stroke-bold', FALLBACK.stroke.bold),
    },
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
    measureCaption: textMeasurer(
      element,
      ['kit-type-caption'],
      read('--brand-type-caption-size', FALLBACK.type.caption),
    ),
    measureLabel: textMeasurer(
      element,
      ['kit-type-label'],
      read('--brand-type-label-size', FALLBACK.type.label),
    ),
    measureTitle: textMeasurer(
      element,
      ['kit-flow-node', 'kit-flow-node-title kit-type-small'],
      read('--brand-type-small-size', FALLBACK.type.caption),
    ),
  };
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
