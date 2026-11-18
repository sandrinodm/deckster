import type { BrandLayoutChromeTokens, ChromeTokens } from '@deckster/brand';
import type { BleedSide } from '@deckster/engine';

import { shownPageNumber, shownSlideIndexes } from '@deckster/engine';

/**
 * A corner of the slide, as the brand's chrome tokens name it.
 */
export type ChromeCorner = ChromeTokens['pageNumber']['corner'];

/**
 * One thing chrome draws in a corner.
 */
export type ChromeItem = 'logo' | 'footer' | 'page';

/**
 * The corners, in the order chrome renders them.
 */
export const CHROME_CORNERS: readonly ChromeCorner[] = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
];

/**
 * The order of items inside one corner, from the outer edge of the slide inward.
 */
const ITEM_ORDER: readonly ChromeItem[] = ['logo', 'footer', 'page'];

/**
 * The corners each edge of the slide covers, for media that bleeds to that edge.
 */
const SIDE_CORNERS = {
  /**
   * Media bleeding to the left edge covers both left corners.
   */
  left: ['top-left', 'bottom-left'],

  /**
   * Media bleeding to the right edge covers both right corners.
   */
  right: ['top-right', 'bottom-right'],

  /**
   * Media bleeding to the top edge covers both top corners.
   */
  top: ['top-left', 'top-right'],

  /**
   * Media bleeding to the bottom edge covers both bottom corners.
   */
  bottom: ['bottom-left', 'bottom-right'],
} as const satisfies Record<BleedSide, readonly ChromeCorner[]>;

/**
 * The corner on the other side of the slide, at the same height, where items move when theirs is
 * covered.
 */
const MIRRORED_CORNER = {
  /**
   * Top left moves to top right.
   */
  'top-left': 'top-right',

  /**
   * Top right moves to top left.
   */
  'top-right': 'top-left',

  /**
   * Bottom left moves to bottom right.
   */
  'bottom-left': 'bottom-right',

  /**
   * Bottom right moves to bottom left.
   */
  'bottom-right': 'bottom-left',
} as const satisfies Record<ChromeCorner, ChromeCorner>;

/**
 * What a brand layout says about the chrome on its slides: items it hides, and a box for the page
 * number.
 */
export type LayoutChrome = BrandLayoutChromeTokens;

/**
 * A box on the canvas: x, y, width and height in canvas pixels.
 */
export type ChromeBox = readonly [number, number, number, number];

/**
 * What {@link planChrome} needs to know about the deck and the slide on screen.
 */
export type ChromeInput = {
  /**
   * The brand's chrome tokens.
   */
  chrome: ChromeTokens;

  /**
   * The corner the brand places its logo in.
   */
  logoCorner: ChromeCorner;

  /**
   * The zero-based index of the slide on screen.
   */
  index: number;

  /**
   * Whether each slide of the deck is hidden, in deck order. The page number, its total and the
   * progress count the shown slides only.
   */
  hidden: readonly boolean[];

  /**
   * The slide's validated frontmatter.
   */
  frontmatter: Readonly<Record<string, unknown>>;

  /**
   * The edges of the slide its layout's media bleeds to, from the layout's `bleed` declaration.
   */
  bleed: readonly BleedSide[];

  /**
   * The `chrome` of the brand layout the slide uses, if it is one: it hides the page number,
   * footer, progress bar or logo, or puts the page number in a box.
   */
  layoutChrome?: LayoutChrome;

  /**
   * The boxes of the brand layout's media regions, instead of `bleed`: a corner is covered only
   * when a box reaches both edges that meet there, so a photo on half the slide leaves the corners
   * on its other half free.
   */
  mediaBoxes?: readonly ChromeBox[];
};

/**
 * What chrome draws for the slide on screen.
 */
export type ChromePlan = {
  /**
   * Whether chrome shows at all: not when the slide or its layout turns it off (`chrome: false`),
   * and not on the first slide when the brand skips it.
   */
  visible: boolean;

  /**
   * The items in each corner, outermost first.
   */
  corners: Readonly<Record<ChromeCorner, readonly ChromeItem[]>>;

  /**
   * The page number as the brand formats it, such as `3 / 14`; empty on a hidden slide, which has
   * no page number.
   */
  pageText: string;

  /**
   * The box the page number stands in when the slide's brand layout places it, instead of a corner;
   * `undefined` for a page number in the brand's corner or none at all.
   */
  pageBox: ChromeBox | undefined;

  /**
   * Whether the progress bar shows: the brand's setting, unless the slide's brand layout hides it.
   */
  progressShown: boolean;

  /**
   * How far through the deck the slide is, from more than 0 up to 1, for the progress bar. A hidden
   * slide keeps the value of the last shown slide before it, or 0 when there is none.
   */
  progress: number;
};

/**
 * Decides what chrome draws for one slide: which items go in which corner, the page number text and
 * the progress. Items the brand does not show are left out. Items in a corner that bleeding media
 * covers move to the corner across the slide at the same height, after the items already there;
 * when that corner is covered too they are left out.
 *
 * @param input - The brand's chrome, the logo corner and the slide on screen.
 * @returns The plan; `visible` is `false` for a slide that hides chrome.
 */
export function planChrome(input: ChromeInput): ChromePlan {
  const { chrome, index } = input;
  const shown = shownSlideIndexes(input.hidden);
  const total = shown.length;
  const page = shownPageNumber(input.hidden, index);
  const reached = shown.filter((slide) => slide <= index).length;
  const covered = new Set<ChromeCorner>([
    ...input.bleed.flatMap((side) => SIDE_CORNERS[side]),
    ...(input.mediaBoxes ?? []).flatMap(cornersCovered),
  ]);
  const own = input.layoutChrome;
  const pageBox = page !== undefined && chrome.pageNumber.show ? pageBoxOf(own) : undefined;
  const placed: Readonly<Record<ChromeItem, ChromeCorner | undefined>> = {
    logo: chrome.logo.show && own?.logo !== false ? input.logoCorner : undefined,
    footer:
      chrome.footer.show && chrome.footer.text !== '' && own?.footer !== false
        ? chrome.footer.corner
        : undefined,
    page:
      chrome.pageNumber.show &&
      page !== undefined &&
      own?.pageNumber !== false &&
      pageBox === undefined
        ? chrome.pageNumber.corner
        : undefined,
  };
  /**
   * The items the brand places in a corner, outermost first.
   */
  const placedIn = (corner: ChromeCorner): readonly ChromeItem[] =>
    ITEM_ORDER.filter((item) => placed[item] === corner);
  /**
   * The items drawn in a corner: its own, then those moved off the covered corner across from it.
   */
  const itemsIn = (corner: ChromeCorner): readonly ChromeItem[] => {
    if (covered.has(corner)) {
      return [];
    }

    const mirrored = MIRRORED_CORNER[corner];
    return covered.has(mirrored) ? [...placedIn(corner), ...placedIn(mirrored)] : placedIn(corner);
  };
  return {
    visible: isVisible(input),
    corners: {
      'top-left': itemsIn('top-left'),
      'top-right': itemsIn('top-right'),
      'bottom-left': itemsIn('bottom-left'),
      'bottom-right': itemsIn('bottom-right'),
    },
    pageText: page === undefined ? '' : formatPageNumber(chrome.pageNumber.format, page, total),
    pageBox,
    progressShown: chrome.progress.show && own?.progress !== false,
    progress: total === 0 ? 0 : Math.min(reached / total, 1),
  };
}

/**
 * The canvas size the boxes are measured on.
 */
const CANVAS = {
  /**
   * Canvas pixels across.
   */
  width: 1920,

  /**
   * Canvas pixels down.
   */
  height: 1080,
} as const;

/**
 * The corners of the slide a box reaches: those where it touches both edges that meet there.
 *
 * @param box - A media box: x, y, width and height in canvas pixels.
 */
function cornersCovered(box: ChromeBox): readonly ChromeCorner[] {
  const [x, y, width, height] = box;
  const left = x <= 0;
  const right = x + width >= CANVAS.width;
  const top = y <= 0;
  const bottom = y + height >= CANVAS.height;
  const corners: ChromeCorner[] = [];
  if (top && left) {
    corners.push('top-left');
  }

  if (top && right) {
    corners.push('top-right');
  }

  if (bottom && left) {
    corners.push('bottom-left');
  }

  if (bottom && right) {
    corners.push('bottom-right');
  }

  return corners;
}

/**
 * The box a brand layout puts the page number in, or `undefined` when it names none.
 *
 * @param own - The layout's `chrome`, if the slide uses a brand layout.
 */
function pageBoxOf(own: LayoutChrome | undefined): ChromeBox | undefined {
  const place = own?.pageNumber;
  return typeof place === 'boolean' || place === undefined ? undefined : place;
}

/**
 * Formats a page number: `{n}` becomes the slide number and `{total}` the slide count.
 *
 * @param format - The brand's format, such as `{n} / {total}`.
 * @param number - The 1-based slide number.
 * @param total - The number of slides.
 */
export function formatPageNumber(format: string, number: number, total: number): string {
  return format.replaceAll('{n}', String(number)).replaceAll('{total}', String(total));
}

/**
 * Whether chrome shows on the slide: not when it turns chrome off, and not on the deck's first
 * shown slide when the brand skips chrome there.
 *
 * @param input - The brand's chrome and the slide on screen.
 */
function isVisible(input: ChromeInput): boolean {
  if (input.frontmatter['chrome'] === false) {
    return false;
  }

  return !(input.chrome.skipFirst && input.index === shownSlideIndexes(input.hidden)[0]);
}
