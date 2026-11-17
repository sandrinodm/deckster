import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

import { useRenderOnFontLoad } from '#foundation/fit-text.ts';
import { MEASURE_TOLERANCE_PX } from '#foundation/layout-geometry.ts';

/**
 * The level a layout is at for one content, so new content starts again from the largest.
 */
type LevelState = {
  /**
   * What the level was found for.
   */
  key: string;

  /**
   * The level, 0 for the largest.
   */
  level: number;

  /**
   * Whether the content still overflows at the last level.
   */
  overflows: boolean;
};

/**
 * The level {@link useFitLevel} picked.
 */
export type FitLevel = {
  /**
   * The level to render at, 0 for the largest.
   */
  level: number;

  /**
   * Whether the content overflows its region even at the last level, so the layout can mark it for
   * `deck lint`.
   */
  overflows: boolean;
};

/**
 * Options of {@link useFitLevel}.
 */
export type FitLevelOptions = {
  /**
   * The share of the region's height the content may take at a level, 1 by default: a layout that
   * grows sparse content keeps its larger levels for content that leaves room.
   */
  fill?: (level: number) => number;

  /**
   * Whether to measure what the content holds rather than its own box. This suits content sized to
   * its region, such as a grid of fixed tracks whose tracks or cells grow past it when their text
   * needs more.
   */
  overflow?: boolean;

  /**
   * The height the content needs, read from layout geometry, for content whose own box does not
   * tell: a grid as tall as its region whose rows may need more, where the items spanning every row
   * are as tall as the rows need. Without it the content's box (or, with `overflow`, its scroll
   * height) is measured.
   */
  height?: (content: HTMLElement) => number;

  /**
   * Whether each finished load of web fonts starts the ladder again from level 0. The ladder only
   * steps down, so a level found while the page still set its text in a fallback face (wider or
   * narrower than the brand's) would otherwise stay after the real fonts arrive; a layout whose
   * first levels are taken only by content that leaves room needs them measured with the real
   * glyphs.
   */
  restartOnFontLoad?: boolean;
};

/**
 * Whether content fits its region both ways, measured with layout geometry.
 *
 * @param content - The element that must fit.
 * @param region - The region it sits in.
 * @param fill - The share of the region's height the content may take.
 * @param overflow - Whether to measure the content's scroll height (what it holds, overflow
 *   included) instead of its box.
 * @param needs - The height the content needs, when its box does not tell.
 */
export function fitsRegion(
  content: HTMLElement,
  region: HTMLElement,
  fill = 1,
  overflow = false,
  needs?: (content: HTMLElement) => number,
): boolean {
  const height = needs?.(content) ?? (overflow ? content.scrollHeight : content.offsetHeight);
  return (
    height <= region.clientHeight * fill + MEASURE_TOLERANCE_PX &&
    content.scrollWidth <= region.clientWidth + MEASURE_TOLERANCE_PX
  );
}

/**
 * Picks the largest of a layout's type levels at which its content fits the region: the layout
 * renders at level 0 (its largest text), and while the content overflows the region it renders
 * again one level down, before paint, until it fits or reaches the last level. The last level's
 * overflow is reported for `deck lint`. A new key starts again from level 0, and so, with
 * `restartOnFontLoad`, does each finished load of web fonts. State, not DOM edits, so React's
 * re-renders and hot reload keep the level.
 *
 * @param region - The region the content must fit.
 * @param content - The content.
 * @param levels - How many levels the layout has, at least 1.
 * @param key - What the content is, such as its frontmatter as JSON; a new key starts at level 0.
 * @param options - How full the region may be at each level.
 * @returns The level to render at, 0 for the largest, and whether the last still overflows.
 */
export function useFitLevel(
  region: RefObject<HTMLElement | null>,
  content: RefObject<HTMLElement | null>,
  levels: number,
  key: string,
  options: FitLevelOptions = {},
): FitLevel {
  const fonts = useRenderOnFontLoad();
  const fitKey = options.restartOnFontLoad === true ? `${key}\n${fonts}` : key;
  const [state, setState] = useState<LevelState>({ key: fitKey, level: 0, overflows: false });
  const current = state.key === fitKey ? state : { key: fitKey, level: 0, overflows: false };
  const last = Math.max(levels - 1, 0);
  const level = Math.min(current.level, last);
  const [, setSize] = useState('');
  // Content that changes size on its own (a chart drawn once its frame is measured) is fitted
  // again: a new size renders the layout, which runs the check below.
  useEffect(() => {
    const fitted = content.current;
    if (fitted === null || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      setSize(`${fitted.offsetWidth}x${fitted.offsetHeight}`);
    });
    observer.observe(fitted);
    return () => {
      observer.disconnect();
    };
  }, [content]);
  useLayoutEffect(() => {
    const box = region.current;
    const fitted = content.current;
    if (box === null || fitted === null) {
      return;
    }

    const fill = level === last ? 1 : (options.fill?.(level) ?? 1);
    const fits = fitsRegion(fitted, box, fill, options.overflow, options.height);
    if (!fits && level < last) {
      setState({ key: fitKey, level: level + 1, overflows: false });
    } else if (level === last && current.overflows === fits) {
      setState({ key: fitKey, level, overflows: !fits });
    }
  });
  return { level, overflows: level === last && current.overflows };
}
