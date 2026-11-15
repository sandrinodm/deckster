import type { PlanItem } from '#plan/plan-scene.ts';
import type { PptxSlideInput } from '#pptx/deck-input.ts';
import type { ImageNode, SceneNode, TextNode } from '#scene/scene.ts';

/**
 * Where the brand's page chrome sits in the scene: under the stage's chrome layer, outside the
 * slide.
 */
const CHROME_SELECTOR = 'kit-chrome';

/**
 * The logo's element.
 */
const LOGO_SELECTOR = 'kit-chrome-logo';

/**
 * A chrome text's element (footer text and page number).
 */
const TEXT_SELECTOR = 'kit-chrome-text';

/**
 * Positions closer than this many canvas pixels count as the same for chrome.
 */
const POSITION_STEP_PX = 2;

/**
 * Matches a run of digits, which the page number's text has in common with other numbers.
 */
const DIGIT_RUN = /\d+/g;

/**
 * One item of the brand's page chrome on a slide: the logo, the footer text or the page number.
 */
export type ChromeShape = {
  /**
   * What it is.
   */
  kind: 'logo' | 'footer' | 'page';

  /**
   * The scene node that draws it: an image for the logo, a text frame for the texts.
   */
  node: ImageNode | TextNode;

  /**
   * What it looks like, as a string: kind, position, size and source or text without digits and
   * color, so the same chrome on two slides compares equal.
   */
  key: string;

  /**
   * The slide it was measured on, whose captures hold its files.
   */
  slide: PptxSlideInput;
};

/**
 * The chrome a slide draws, from its grouped plan items.
 *
 * @param slide - The slide.
 * @param items - Its items after text grouping.
 * @returns The chrome items, logo first.
 */
export function chromeShapes(slide: PptxSlideInput, items: readonly PlanItem[]): ChromeShape[] {
  const number = String(slide.slideIndex + 1);
  return items.flatMap((item): ChromeShape[] => {
    const { node } = item;
    if (item.kind !== 'native' || !isChrome(node)) {
      return [];
    }

    if (node.kind === 'image' && node.selector.includes(LOGO_SELECTOR)) {
      return [{ kind: 'logo', node, key: keyOf('logo', node, node.src), slide }];
    }

    if (node.kind !== 'text' || !node.selector.includes(TEXT_SELECTOR)) {
      return [];
    }

    const text = textOf(node);
    const kind = new RegExp(`(^|\\D)${number}(?!\\d)`).test(text) ? 'page' : 'footer';
    const color = node.paragraphs[0]?.lines[0]?.runs[0]?.style.color ?? '';
    const shown = kind === 'page' ? text.replace(DIGIT_RUN, '#') : text;
    return [{ kind, node, key: keyOf(kind, node, `${shown}|${color}`), slide }];
  });
}

/**
 * Whether a scene node is part of the page chrome.
 *
 * @param node - The node.
 */
export function isChrome(node: SceneNode): boolean {
  return node.selector.includes(CHROME_SELECTOR);
}

/**
 * Whether two sets of chrome look the same.
 *
 * @param a - Chrome items.
 * @param b - Other chrome items.
 */
export function sameChrome(a: readonly ChromeShape[], b: readonly ChromeShape[]): boolean {
  /**
   * The items' keys, sorted, as one string.
   */
  const keys = (items: readonly ChromeShape[]): string =>
    items
      .map((item) => item.key)
      .sort()
      .join('\n');
  return keys(a) === keys(b);
}

/**
 * The chrome most slides of a set draw, for a slide master: the most common look, ties going to the
 * earliest slide.
 *
 * @param sets - Each slide's chrome, in order.
 */
export function commonChrome(sets: readonly (readonly ChromeShape[])[]): ChromeShape[] {
  let best: readonly ChromeShape[] = [];
  let bestCount = 0;
  for (const candidate of sets) {
    if (candidate.length === 0) {
      continue;
    }

    const count = sets.filter((other) => sameChrome(other, candidate)).length;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }

  return [...best];
}

/**
 * The text of a frame.
 *
 * @param node - The frame.
 */
function textOf(node: TextNode): string {
  return node.paragraphs
    .map((paragraph) =>
      paragraph.lines.map((line) => line.runs.map((run) => run.text).join('')).join(' '),
    )
    .join(' ');
}

/**
 * The comparison key of a chrome item.
 *
 * @param kind - What it is.
 * @param node - Its node.
 * @param look - Its source or text and color.
 */
function keyOf(kind: string, node: SceneNode, look: string): string {
  const box = [node.rect.x, node.rect.y, node.rect.width, node.rect.height].map((value) =>
    Math.round(value / POSITION_STEP_PX),
  );
  return `${kind}|${box.join(',')}|${look}`;
}
