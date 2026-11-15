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
};

/**
 * Whether content fits its region both ways, measured with layout geometry.
 *
 * @param content - The element that must fit.
 * @param region - The region it sits in.
 * @param fill - The share of the region's height the content may take.
 */
export function fitsRegion(content: HTMLElement, region: HTMLElement, fill = 1): boolean {
  return (
    content.offsetHeight <= region.clientHeight * fill + MEASURE_TOLERANCE_PX &&
    content.scrollWidth <= region.clientWidth + MEASURE_TOLERANCE_PX
  );
}

/**
 * Picks the largest of a layout's type levels at which its content fits the region: the layout
 * renders at level 0 (its largest text), and while the content overflows the region it renders
 * again one level down, before paint, until it fits or reaches the last level, whose overflow `deck
 * lint` reports. State, not DOM edits, so React's re-renders and hot reload keep the level.
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
  const [state, setState] = useState<LevelState>({ key, level: 0, overflows: false });
  const current = state.key === key ? state : { key, level: 0, overflows: false };
  const last = Math.max(levels - 1, 0);
  const level = Math.min(current.level, last);
  const [, setSize] = useState('');
  useRenderOnFontLoad();
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
    const fits = fitsRegion(fitted, box, fill);
    if (!fits && level < last) {
      setState({ key, level: level + 1, overflows: false });
    } else if (level === last && current.overflows === fits) {
      setState({ key, level, overflows: !fits });
    }
  });
  return { level, overflows: level === last && current.overflows };
}
