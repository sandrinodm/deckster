import type { BrandLayoutTokens, BrandTokens } from '@deckster/brand';

import { layoutLayers } from '@deckster/brand';

import type { ExportMode, PlanItem } from '#plan/plan-scene.ts';
import type { PptxSlideInput } from '#pptx/deck-input.ts';
import type { SceneNode } from '#scene/scene.ts';

import { groupText } from '#plan/group-text.ts';
import { chromeShapes, modalChrome, sameChrome, type ChromeShape } from '#pptx/chrome.ts';

/**
 * Canvas pixels the rectangles of art are rounded to when two arts are compared.
 */
const ART_POSITION_STEP_PX = 2;

/**
 * The art a brand layout draws behind its slides, written once in the slide layout part.
 */
export type LayoutArt = {
  /**
   * The slide the art was measured on, whose captures hold its files.
   */
  slide: PptxSlideInput;

  /**
   * The art's items in paint order.
   */
  items: PlanItem[];
};

/**
 * What the slides of one brand layout on one surface share: the art and the chrome the layout part
 * draws.
 */
export type LayoutSource = {
  /**
   * The art, or `null` when the layout has none for the surface.
   */
  art: LayoutArt | null;

  /**
   * The chrome most of the slides draw, or `null` when there are no slides.
   */
  chrome: ChromeShape[] | null;
};

/**
 * The brand layout a deck layout name refers to, if the brand brings one.
 *
 * @param brand - The brand.
 * @param name - The deck layout's name.
 * @returns The layout, or `undefined` for a kit or engine layout.
 */
export function brandLayoutOf(brand: BrandTokens, name: string): BrandLayoutTokens | undefined {
  return brand.layouts.find((layout) => layout.name === name);
}

/**
 * Whether a scene node belongs to a layout's art rather than to the slide: a node of the background
 * layers (the surface's or the brand layout's) that is not the slide's own `background:` image.
 *
 * @param node - The node.
 */
export function isLayoutArtNode(node: SceneNode): boolean {
  return node.backdrop === true && node.slideImage !== true;
}

/**
 * The plan items that make up the art of the brand layout a slide is on: the layout's background
 * layers for the slide's surface. Empty for a slide on a kit layout, for a brand layout with no art
 * for the surface (whose backdrop is the surface's own) and for a slide that hides the art
 * (`background: none`).
 *
 * @param slide - The slide.
 * @param brand - The brand.
 * @returns The items in paint order.
 */
export function layoutArtItems(slide: PptxSlideInput, brand: BrandTokens): PlanItem[] {
  const layout = brandLayoutOf(brand, slide.scene.layout);
  if (layout === undefined || layoutLayers(layout, slide.scene.surface) === undefined) {
    return [];
  }

  return slide.plan.items.filter((item) => isLayoutArtNode(item.node));
}

/**
 * What the slides of a brand layout on a surface share: the art the most of them draw and the
 * chrome the most of them show, each from the first slide that has it.
 *
 * @param slides - The slides on the layout and surface, in order.
 * @param brand - The brand.
 * @param mode - The export mode; `image` slides are one picture and have no layout art.
 */
export function layoutSource(
  slides: readonly PptxSlideInput[],
  brand: BrandTokens,
  mode: ExportMode | undefined,
): LayoutSource {
  const chromeSets = slides.map((slide) => slideChromeOf(slide));
  const chrome = slides.length === 0 ? null : modalChrome(chromeSets);
  if (mode === 'image') {
    return { art: null, chrome };
  }

  const arts = slides.flatMap((slide): LayoutArt[] => {
    const items = layoutArtItems(slide, brand);
    return items.length === 0 ? [] : [{ slide, items }];
  });
  let art: LayoutArt | null = null;
  let bestCount = 0;
  for (const candidate of arts) {
    const key = artKey(candidate.items);
    const count = arts.filter((other) => artKey(other.items) === key).length;
    if (count > bestCount) {
      art = candidate;
      bestCount = count;
    }
  }

  return { art, chrome };
}

/**
 * Whether a slide shows its layout's art by inheriting it: it has no background image of its own,
 * draws the same art and the same chrome as the layout part, and draws no background shapes that
 * would paint over the art. Any other slide draws the art itself, and hides the layout's shapes.
 *
 * @param slide - The slide.
 * @param source - What the layout part draws.
 */
export function showsLayoutArt(slide: PptxSlideInput, source: LayoutSource): boolean {
  const { art, chrome } = source;
  if (art === null || chrome === null || drawsBackgroundShapes(slide)) {
    return false;
  }

  const ownBackdrop = slide.plan.items.some(
    (item) => item.node.backdrop === true && !isLayoutArtNode(item.node),
  );
  const items = slide.plan.items.filter((item) => isLayoutArtNode(item.node));
  return (
    !ownBackdrop && artKey(items) === artKey(art.items) && sameChrome(slideChromeOf(slide), chrome)
  );
}

/**
 * How many of a slide's elements are art its layout part draws for it.
 *
 * @param slide - The slide.
 * @param slides - Every slide of the export.
 * @param brand - The brand.
 * @param mode - The export mode.
 */
export function layoutArtCount(
  slide: PptxSlideInput,
  slides: readonly PptxSlideInput[],
  brand: BrandTokens,
  mode: ExportMode | undefined,
): number {
  const own = slides.filter(
    (other) =>
      other.scene.layout === slide.scene.layout && other.scene.surface === slide.scene.surface,
  );
  const source = layoutSource(own, brand, mode);
  return showsLayoutArt(slide, source) ? (source.art?.items.length ?? 0) : 0;
}

/**
 * Whether a slide paints background shapes of its own (a gradient's picture fallback or grain),
 * which sit above whatever its layout draws.
 *
 * @param slide - The slide.
 */
export function drawsBackgroundShapes(slide: PptxSlideInput): boolean {
  const { background } = slide.plan;
  if (background.kind !== 'paint') {
    return false;
  }

  const fallback = background.paint.kind !== 'solid' && slide.assets.background !== null;
  return fallback || (background.grain && slide.assets.grain !== null);
}

/**
 * A slide's page chrome.
 *
 * @param slide - The slide.
 */
function slideChromeOf(slide: PptxSlideInput): ChromeShape[] {
  return chromeShapes(slide, groupText(slide.plan.items));
}

/**
 * A comparison key of art: each item's kind, source or paint, place and opacity.
 *
 * @param items - The art's items.
 */
function artKey(items: readonly PlanItem[]): string {
  return items
    .map(({ node }) => {
      const look = nodeLook(node);
      const { x, y, width, height } = node.rect;
      const rect = [x, y, width, height].map((value) => Math.round(value / ART_POSITION_STEP_PX));
      return `${node.kind}|${rect.join(',')}|${node.opacity}|${look}`;
    })
    .join('\n');
}

/**
 * What a node of art draws: its image source or its fill.
 *
 * @param node - The node.
 */
function nodeLook(node: SceneNode): string {
  if (node.kind === 'image') {
    return node.src;
  }

  return node.kind === 'box' ? JSON.stringify(node.fill) : '';
}
