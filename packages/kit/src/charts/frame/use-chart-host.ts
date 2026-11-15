import { getBrand } from '@deckster/brand/runtime';
import { useReadyHold, useSlide, useStatic } from '@deckster/engine';
import { useEffect, useLayoutEffect, useMemo, useState, type RefObject } from 'react';

import type { ChartTheme } from '#charts/frame/chart-theme.ts';

import { chartTheme } from '#charts/frame/chart-theme.ts';
import {
  canvasMeasure,
  EMPHASIS_WEIGHT,
  fontShorthand,
  type Measure,
} from '#charts/layout/text-measure.ts';

/**
 * The surface a slide gets when neither it nor its layout names one.
 */
const DEFAULT_SURFACE = 'default';

/**
 * The size of a chart's plot area in canvas pixels, as layout measures it (transforms ignored).
 */
export type PlotSize = {
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
 * What a chart needs from the page before it can lay itself out.
 */
export type ChartHost = {
  /**
   * The plot area's size, or `undefined` until it has been measured.
   */
  size: PlotSize | undefined;

  /**
   * The brand's chart theme for the surface the chart is drawn on.
   */
  theme: ChartTheme;

  /**
   * Measures text in the chart's type, once its fonts have loaded.
   */
  measure: Measure;

  /**
   * Whether the deck is in static mode, where nothing moves.
   */
  isStatic: boolean;

  /**
   * The slide's `data:` frontmatter, for charts that name a dataset.
   */
  datasets: unknown;

  /**
   * Whether the chart should play its entrance: the slide just came on screen going forward.
   */
  entrance: boolean;
};

/**
 * Connects a chart to the slide it is drawn on. It reads the surface from the nearest
 * `data-surface` (so a layout's default surface counts), measures the plot area with a
 * `ResizeObserver` (layout pixels, so the canvas scale and slide transitions never change it),
 * loads the fonts of the chart's text styles before measuring text, and holds the deck's `ready()`
 * until all three are known, so `deck shot`, `deck lint` and export see the laid-out chart.
 *
 * @param root - The chart's root element, inside the slide.
 * @param plot - The element whose size the plot fills.
 * @returns The size, theme, measurer and mode.
 */
export function useChartHost(
  root: RefObject<HTMLElement | null>,
  plot: RefObject<HTMLElement | null>,
): ChartHost {
  const slide = useSlide();
  const isStatic = useStatic();
  const surface = useSurface(root, slide.frontmatter.surface ?? DEFAULT_SURFACE);
  const { background } = slide.frontmatter;
  const slideImage = background !== undefined && background !== 'none';
  const theme = useMemo(() => chartTheme(getBrand(surface), slideImage), [surface, slideImage]);
  const size = usePlotSize(plot);
  const fontsReady = useChartFonts(theme);
  const [measure] = useState(canvasMeasure);
  const entrance = useEntrance(slide.isActive, slide.direction, isStatic);
  useReadyHold(size === undefined || !fontsReady);
  return {
    size: fontsReady ? size : undefined,
    theme,
    measure,
    isStatic,
    datasets: Reflect.get(slide.frontmatter, 'data'),
    entrance,
  };
}

/**
 * The surface of the slide the chart is in, from the DOM once mounted.
 *
 * @param root - The chart's root element.
 * @param fallback - The surface the slide's frontmatter names, for the first render.
 */
function useSurface(root: RefObject<HTMLElement | null>, fallback: string): string {
  const [surface, setSurface] = useState(fallback);
  // The surface is the DOM's (a layout may give the slide one its frontmatter does not name); it
  // does not change while the chart is mounted.
  useLayoutEffect(() => {
    const found = root.current?.closest('[data-surface]')?.getAttribute('data-surface');
    if (found !== null && found !== undefined) {
      // The surface lives in the DOM, outside React: reading it after mount is the one way to know
      // it, and it is set once, before paint.
      // oxlint-disable-next-line react/set-state-in-effect
      setSurface(found);
    }
  }, [root]);
  return surface;
}

/**
 * The size of an element, kept current with a `ResizeObserver`.
 *
 * @param plot - The element.
 */
function usePlotSize(plot: RefObject<HTMLElement | null>): PlotSize | undefined {
  const [size, setSize] = useState<PlotSize>();
  useLayoutEffect(() => {
    const element = plot.current;
    if (element === null) {
      return undefined;
    }

    /**
     * Records the element's size when it changed by a whole pixel.
     */
    const update = (): void => {
      const width = Math.floor(element.clientWidth);
      const height = Math.floor(element.clientHeight);
      setSize((current) =>
        current?.width === width && current.height === height ? current : { width, height },
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [plot]);
  return size;
}

/**
 * Loads the faces a chart's text styles use and reports when they are in, so text is measured in
 * the brand's fonts rather than the fallback.
 *
 * @param theme - The chart theme.
 */
function useChartFonts(theme: ChartTheme): boolean {
  const fonts = typeof document === 'undefined' ? undefined : document.fonts;
  const [ready, setReady] = useState(fonts === undefined);
  const key = Object.values(theme.text)
    .flatMap((style) => [
      fontShorthand(style),
      fontShorthand({ ...style, weight: EMPHASIS_WEIGHT }),
    ])
    .join('|');
  useEffect(() => {
    if (fonts === undefined) {
      return undefined;
    }

    let live = true;
    const loads = key.split('|').map((font) => fonts.load(font));
    void Promise.allSettled(loads)
      .then(() => fonts.ready)
      .then(() => {
        if (live) {
          setReady(true);
        }
      });
    return () => {
      live = false;
    };
  }, [fonts, key]);
  return ready;
}

/**
 * Whether the chart should play its entrance: it turns on when the slide comes on screen going
 * forward and off when the slide leaves, never in static mode.
 *
 * @param isActive - Whether the slide is the one on screen.
 * @param direction - Which way the deck moved last.
 * @param isStatic - Whether the deck is in static mode.
 */
function useEntrance(isActive: boolean, direction: string, isStatic: boolean): boolean {
  const [seen, setSeen] = useState({ active: isActive, entrance: false });
  if (seen.active !== isActive) {
    setSeen({ active: isActive, entrance: isActive && direction === 'forward' && !isStatic });
  }

  return seen.entrance;
}
