import { MIN_TYPE_SIZE_PX } from '@deckster/brand';
import { useReadyHold } from '@deckster/engine';
import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

/**
 * The scale factors a block's font steps down through, largest first: six small steps, so a long
 * line gives up as little size as it must.
 */
export const CODE_FIT_STEPS: readonly number[] = [1, 0.94, 0.88, 0.82, 0.76, 0.7];

/**
 * The scale factors a short block steps up through in a layout's code region, largest first: a
 * block of a few short lines takes up to a quarter more size instead of leaving the bottom of the
 * slide empty.
 */
export const CODE_GROW_STEPS: readonly number[] = [1.25, 1.18, 1.12, 1.06];

/**
 * The class of the element a block may grow into: a layout's code region, whose height the block's
 * frame must keep within.
 */
export const CODE_REGION_CLASS = 'kit-code-region';

/**
 * The share of the region's height a grown block may take, leaving room for the optical margin.
 */
const GROW_HEIGHT_SHARE = 0.92;

/**
 * The custom property the code stylesheet multiplies the code type size by.
 */
const FIT_PROPERTY = '--kit-code-fit';

/**
 * Extra width or height in canvas pixels a block may have before it counts as too wide or too tall;
 * absorbs sub-pixel rounding.
 */
const FIT_TOLERANCE_PX = 1;

/**
 * How a block ended up, set as its `data-fit` attribute: stepped up to fill a layout's code region,
 * at the brand's code size, stepped down, or still too wide or too tall at the smallest allowed
 * size (then its lines run out of the frame or the region, which `deck lint` reports as overflow).
 */
export type CodeFit = 'grown' | 'natural' | 'stepped' | 'overflow';

/**
 * The largest scale at which text still meets the brand's minimum type size, and so the smallest
 * scale a block may use.
 *
 * @param basePx - The code type size at scale 1, in canvas pixels.
 * @returns A factor between 0 and 1; 1 when the base size is not above the minimum.
 */
export function minimumScale(basePx: number): number {
  return basePx <= MIN_TYPE_SIZE_PX ? 1 : MIN_TYPE_SIZE_PX / basePx;
}

/**
 * The scales a block may try for a base size: the steps that keep text at or above the minimum.
 *
 * @param basePx - The code type size at scale 1, in canvas pixels.
 */
export function allowedScales(basePx: number): number[] {
  const floor = minimumScale(basePx);
  return CODE_FIT_STEPS.filter((scale, index) => index === 0 || scale >= floor);
}

/**
 * Steps a code block's font size down until its longest line fits the frame and, in a layout's code
 * region, the block fits the region's height, never below the brand's minimum type size; in a
 * layout's code region a short block first steps up, by at most {@link CODE_GROW_STEPS}, as far as
 * its lines and the region's height allow. It measures again after every render and when web fonts
 * finish loading, and holds the deck's `ready()` until the fonts have settled so screenshots and
 * lint see the fitted size.
 *
 * @param ref - The frame's code area; its first element child is the block of lines.
 */
export function useCodeFit(ref: RefObject<HTMLElement | null>): void {
  const [fontsSettled, setFontsSettled] = useState(() => document.fonts === undefined);
  const [, setVersion] = useState(0);
  useReadyHold(!fontsSettled);
  useEffect(() => {
    const fonts: FontFaceSet | undefined = document.fonts;
    if (fonts === undefined) {
      return undefined;
    }

    let live = true;
    void fonts.ready.then(() => {
      if (live) {
        setVersion((current) => current + 1);
        setFontsSettled(true);
      }
    });
    return () => {
      live = false;
    };
  }, []);
  // Runs after every render: the lines change with the step and the fonts, and refitting is cheap.
  useLayoutEffect(() => {
    const area = ref.current;
    if (area !== null) {
      fitCode(area);
    }
  });
}

/**
 * The props of the hidden element a block uses to measure its widest line when the lines change
 * between states, as in a `CodeMove`. Spread them onto the element.
 */
export const PROBE_PROPS = {
  /**
   * Marks the element as the probe.
   */
  'data-probe': '',
} as const;

/**
 * The selector that finds the probe in a code area.
 */
const PROBE_SELECTOR = '[data-probe]';

/**
 * Fits one code area and records the outcome in `data-fit`. The width a block needs is its first
 * child's scroll width, or the width of a probe element (`data-probe`) set in the widest line.
 *
 * @param area - The element that holds the lines; its width is the room available. Its font size is
 *   the code type size times the fit factor.
 * @returns How the block ended up.
 */
export function fitCode(area: HTMLElement): CodeFit {
  const block = area.firstElementChild;
  if (!(block instanceof HTMLElement)) {
    return 'natural';
  }

  const probe = area.querySelector<HTMLElement>(PROBE_SELECTOR);
  /**
   * The width the lines need at the current scale.
   */
  const needed = (): number => probe?.offsetWidth ?? block.scrollWidth;
  const region = area.closest<HTMLElement>(`.${CODE_REGION_CLASS}`);
  const frame = area.closest<HTMLElement>('.kit-code') ?? area;
  // The base scale is read before any step is tried, so the size is the brand's.
  area.style.setProperty(FIT_PROPERTY, '1');
  const scales = allowedScales(Number.parseFloat(getComputedStyle(area).fontSize));
  const grown = region !== null && growToRegion(area, frame, region, needed);
  /**
   * Whether the lines fit at the current scale: as wide as the area, and in a layout's code region
   * no taller than its room.
   */
  const fits = (): boolean =>
    needed() <= area.clientWidth + FIT_TOLERANCE_PX &&
    (region === null || frame.offsetHeight <= roomHeight(region) + FIT_TOLERANCE_PX);
  const result = grown ? 'grown' : shrinkToFit(area, scales, fits);
  area.dataset['fit'] = result;
  return result;
}

/**
 * Steps a short block up through {@link CODE_GROW_STEPS} and keeps the first, so the largest, step
 * whose frame still fits the region's height and whose lines still fit the width. When none fits,
 * the custom property is left at the last step tried; the caller then fits the block again.
 *
 * @param area - The element that holds the lines.
 * @param frame - The code frame, whose height the region must hold.
 * @param region - The layout's code region.
 * @param needed - The width the lines need at the current scale.
 * @returns Whether a step fits.
 */
function growToRegion(
  area: HTMLElement,
  frame: HTMLElement,
  region: HTMLElement,
  needed: () => number,
): boolean {
  for (const scale of CODE_GROW_STEPS) {
    area.style.setProperty(FIT_PROPERTY, String(scale));
    const fitsHeight = frame.offsetHeight <= region.clientHeight * GROW_HEIGHT_SHARE;
    if (fitsHeight && needed() <= area.clientWidth + FIT_TOLERANCE_PX) {
      return true;
    }
  }

  return false;
}

/**
 * The height a layout's code region holds: its content box, inside any padding.
 *
 * @param region - The layout's code region.
 */
function roomHeight(region: HTMLElement): number {
  const style = getComputedStyle(region);
  const padding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
  return region.clientHeight - (Number.isFinite(padding) ? padding : 0);
}

/**
 * Steps a block down through its allowed scales until its lines fit: as wide as the frame and, in a
 * layout's code region, as tall as its room, so a block at the layout's line budget fits a brand
 * with tall code lines or a footnote below it.
 *
 * @param area - The element that holds the lines.
 * @param scales - The allowed scales, largest first; the first one is the brand's size.
 * @param fits - Whether the lines fit at the current scale.
 * @returns `natural` at the brand's size, `stepped` at a smaller one, `overflow` when none fits.
 */
function shrinkToFit(
  area: HTMLElement,
  scales: readonly number[],
  fits: () => boolean,
): Exclude<CodeFit, 'grown'> {
  for (const [index, scale] of scales.entries()) {
    area.style.setProperty(FIT_PROPERTY, String(scale));
    if (fits()) {
      return index === 0 ? 'natural' : 'stepped';
    }
  }

  return 'overflow';
}
