import type { ChromeTokens } from '@deckster/brand';
import type { BleedSide } from '@deckster/engine';

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
   * The number of slides in the deck.
   */
  total: number;

  /**
   * The slide's validated frontmatter.
   */
  frontmatter: Readonly<Record<string, unknown>>;

  /**
   * The edges of the slide its layout's media bleeds to, from the layout's `bleed` declaration.
   */
  bleed: readonly BleedSide[];
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
   * The page number as the brand formats it, such as `3 / 14`.
   */
  pageText: string;

  /**
   * How far through the deck the slide is, from more than 0 up to 1, for the progress bar.
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
  const { chrome, index, total } = input;
  const covered = new Set<ChromeCorner>(input.bleed.flatMap((side) => SIDE_CORNERS[side]));
  const placed: Readonly<Record<ChromeItem, ChromeCorner | undefined>> = {
    logo: chrome.logo.show ? input.logoCorner : undefined,
    footer: chrome.footer.show && chrome.footer.text !== '' ? chrome.footer.corner : undefined,
    page: chrome.pageNumber.show ? chrome.pageNumber.corner : undefined,
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
    pageText: formatPageNumber(chrome.pageNumber.format, index + 1, total),
    progress: total === 0 ? 0 : Math.min((index + 1) / total, 1),
  };
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
 * Whether chrome shows on the slide.
 *
 * @param input - The brand's chrome and the slide on screen.
 */
function isVisible(input: ChromeInput): boolean {
  if (input.frontmatter['chrome'] === false) {
    return false;
  }

  return !(input.chrome.skipFirst && input.index === 0);
}
