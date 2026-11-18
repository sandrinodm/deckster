import type { BrandTokens } from '@deckster/brand';
import type { AnyLayoutContract } from '@deckster/engine/layout';

import { strFromU8, unzipSync } from 'fflate';

import type { PptxDeckInput, PptxSlideInput, SlideAssets } from '#pptx/deck-input.ts';
import type { ImageNode, SceneNode, SlideScene, TextNode } from '#scene/scene.ts';

import { planScene } from '#plan/plan-scene.ts';
import { line, paragraph, run, runStyle, scene, textNode } from '#scene/scene.fixture.ts';

/**
 * A content layout whose title and body are placeholders.
 */
export function contentContract(): AnyLayoutContract {
  return {
    name: 'content',
    pptx: {
      type: 'content',
      placeholders: [
        { kind: 'title', from: { selector: '.kit-title' } },
        { kind: 'body', from: { slot: 'body' } },
      ],
    },
  } as unknown as AnyLayoutContract;
}

/**
 * A one-pixel PNG.
 */
export const PIXEL_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

/**
 * The brand's logo in the page chrome, as the scene has it.
 *
 * @param id - Its node id.
 */
export function logoNode(id: number): ImageNode {
  return {
    id,
    parent: null,
    rect: { x: 1700, y: 60, width: 90, height: 30 },
    selector: 'div.kit-chrome > div.kit-chrome-layer > div.kit-chrome-corner > img.kit-chrome-logo',
    order: id,
    opacity: 1,
    hints: [],
    slot: null,
    step: null,
    replacedAt: null,
    kind: 'image',
    src: '/brand/logo.png',
    alt: '',
    natural: { width: 90, height: 30 },
    crop: { left: 0, top: 0, right: 0, bottom: 0 },
    radii: [0, 0, 0, 0],
    vector: false,
    grayscale: false,
    href: null,
  };
}

/**
 * The page number in the page chrome, as the scene has it.
 *
 * @param id - Its node id.
 * @param text - What it shows, such as `2 / 16`.
 */
export function pageNode(id: number, text: string): TextNode {
  const style = runStyle({ family: 'Bricolage Grotesque', size: 22, color: '#555c6a' });
  return textNode(
    id,
    paragraph([line(text, 1010, { left: 1700, right: 1790, runs: [run(text, { style })] })], {
      box: { x: 1700, y: 990, width: 90, height: 26 },
      wrapWidth: null,
    }),
    {
      selector:
        'div.kit-chrome > div.kit-chrome-layer > div.kit-chrome-corner > span.kit-chrome-text',
      slot: null,
    },
  );
}

/**
 * A slide's title, as a layout's title placeholder reads it.
 *
 * @param id - Its node id.
 * @param text - The title.
 */
export function titleNode(id: number, text: string): TextNode {
  const style = runStyle({
    family: 'Bricolage Grotesque',
    size: 80,
    weight: 620,
    color: '#161920',
  });
  return textNode(
    id,
    paragraph([line(text, 200, { runs: [run(text, { style })] })], {
      box: { x: 128, y: 120, width: 1664, height: 100 },
    }),
    { slot: null, matches: ['.kit-title'] },
  );
}

/**
 * A captured slide: its scene planned in hybrid mode, with the logo's file and no pictures.
 *
 * @param slideIndex - The deck slide index.
 * @param nodes - What it draws.
 * @param overrides - Scene fields that differ.
 */
export function slideInput(
  slideIndex: number,
  nodes: SceneNode[],
  overrides: Partial<SlideScene> = {},
): PptxSlideInput {
  const slideScene = scene({ nodes, ...overrides });
  const assets: SlideAssets = {
    pictures: new Map(),
    images: new Map([['/brand/logo.png', { data: PIXEL_PNG, extension: 'png' }]]),
    media: new Map(),
    slidePicture: null,
    background: null,
    grain: null,
  };
  return {
    slideIndex,
    step: null,
    title: `Slide ${slideIndex + 1}`,
    notes: 'Say hello.\n\nThen move on.',
    scene: slideScene,
    plan: planScene(slideScene, 'hybrid', {
      paint: { kind: 'solid', color: '#fcfcfd' },
      texture: null,
    }),
    assets,
  };
}

/**
 * A deck of slides in a brand, in hybrid mode with animations, no textures and no embedded fonts.
 *
 * @param brand - The resolved brand.
 * @param slides - The slides.
 * @param overrides - Fields that differ.
 */
export function deckInput(
  brand: BrandTokens,
  slides: PptxSlideInput[],
  overrides: Partial<PptxDeckInput> = {},
): PptxDeckInput {
  return {
    title: 'Fixture deck',
    brand,
    mode: 'hybrid',
    layouts: [contentContract()],
    slides,
    surfaceTextures: new Map(),
    animate: true,
    slideIds: Array.from({ length: 16 }, (_, index) => `slide-${index + 1}`),
    outlineFonts: null,
    lang: 'en-GB',
    fonts: null,
    ...overrides,
  };
}

/**
 * The parts of a PPTX: XML parts as text, others as their size.
 *
 * @param bytes - The PPTX.
 */
export function partsOf(bytes: Uint8Array): Record<string, string> {
  return Object.fromEntries(
    Object.entries(unzipSync(bytes)).map(([name, data]) => [
      name,
      name.endsWith('.xml') || name.endsWith('.rels') ? strFromU8(data) : `${data.length} bytes`,
    ]),
  );
}
