import type { BrandTokens } from '@deckster/brand';
import type { AnyLayoutContract } from '@deckster/engine/layout';

import type { ExportMode, ScenePlan } from '#plan/plan-scene.ts';
import type { OutlineFonts } from '#pptx/outline-text.ts';
import type { FontChoice, FontResolver } from '#pptx/text-xml.ts';
import type { SlideScene } from '#scene/scene.ts';

/**
 * A file the browser loaded or captured, ready to embed.
 */
export type EmbeddedFile = {
  /**
   * The bytes.
   */
  data: Uint8Array;

  /**
   * The file extension the part gets: `png`, `jpeg`, `gif`, `svg`, `mp4` or `mov`.
   */
  extension: string;
};

/**
 * What the browser captured for one slide besides its scene.
 */
export type SlideAssets = {
  /**
   * Pictures by node id, PNG when they have transparency and JPEG when not, at most 2x and at most
   * the pixels of a 1920x1080 slide each unless the export asked for a scale: rasterised elements,
   * the paint of textured boxes, and the fallback of SVG pictures.
   */
  pictures: ReadonlyMap<number, Uint8Array>;

  /**
   * The original image files by the URL the page loaded them from.
   */
  images: ReadonlyMap<string, EmbeddedFile>;

  /**
   * Video files to embed, by the id of their media node.
   */
  media: ReadonlyMap<number, EmbeddedFile>;

  /**
   * The whole slide as a JPEG, for `image` mode; `null` otherwise.
   */
  slidePicture: Uint8Array | null;

  /**
   * The paint of the box that covers the slide (a mesh gradient surface background) as a picture,
   * when the capture asked for it; `null` otherwise.
   */
  background: Uint8Array | null;

  /**
   * The brand's grain as a small PNG tile, when the slide or its master tiles it over a native
   * fill; `null` otherwise.
   */
  grain: GrainFile | null;
};

/**
 * The brand's grain texture as a tile.
 */
export type GrainFile = {
  /**
   * The tile as a PNG with transparency, one pixel per canvas pixel.
   */
  data: Uint8Array;

  /**
   * Its size in canvas pixels.
   */
  size: number;
};

/**
 * What a surface's slide master needs beyond its theme: the grain tiled over its native gradient,
 * and a picture of the whole background (the background itself for a mesh gradient; for a native
 * gradient, the fallback that renderers without multi-stop gradients, such as Apple's, draw).
 */
export type SurfaceTexture = {
  /**
   * The grain tile, or `null`.
   */
  grain: GrainFile | null;

  /**
   * The picture of the background, or `null`.
   */
  picture: Uint8Array | null;
};

/**
 * One exported slide: a deck slide at one step.
 */
export type PptxSlideInput = {
  /**
   * The deck slide's zero-based index.
   */
  slideIndex: number;

  /**
   * The step shown, or `null` for the finished slide.
   */
  step: number | null;

  /**
   * The slide title, for the outline and the slide's name.
   */
  title: string;

  /**
   * The speaker notes.
   */
  notes: string;

  /**
   * The scene measured in the browser.
   */
  scene: SlideScene;

  /**
   * What the writer draws natively and as pictures.
   */
  plan: ScenePlan;

  /**
   * The captured files.
   */
  assets: SlideAssets;

  /**
   * Whether the slide is hidden in the deck: it is written with `show="0"`, so PowerPoint skips it
   * in a slide show. Absent means shown.
   */
  hidden?: boolean;
};

/**
 * Everything the PPTX writer needs for one deck.
 */
export type PptxDeckInput = {
  /**
   * The deck title, for the document properties.
   */
  title: string;

  /**
   * The brand the deck rendered with.
   */
  brand: BrandTokens;

  /**
   * The export mode.
   */
  mode: ExportMode;

  /**
   * The layout contracts of the deck's layouts, for slide layouts and placeholders.
   */
  layouts: readonly AnyLayoutContract[];

  /**
   * The slides, in order.
   */
  slides: readonly PptxSlideInput[];

  /**
   * The texture of each textured surface, by surface name, for the surface's slide master in
   * `hybrid` mode.
   */
  surfaceTextures: ReadonlyMap<string, SurfaceTexture>;

  /**
   * Whether to turn step reveals into click animations (export without `--steps`).
   */
  animate: boolean;

  /**
   * The complete slide ids in deck order, to resolve numeric and named slide links.
   */
  slideIds: readonly string[];

  /**
   * The brand's fonts for `--outline-text`, which draws display-size text as vector shapes; `null`
   * keeps all text as text.
   */
  outlineFonts: OutlineFonts | null;

  /**
   * The language of the deck's text, as a BCP 47 tag such as `en-US`.
   */
  lang: string;

  /**
   * How runs are set in fonts, the fonts embedded in the file, and the theme's heading and body
   * fonts; `null` writes the brand's families through the theme without embedding.
   */
  fonts: PptxFonts | null;
};

/**
 * The fonts of a presentation: how each run's font is chosen, the font files embedded, and the
 * theme's heading and body fonts.
 */
export type PptxFonts = {
  /**
   * Picks each run's font.
   */
  resolve: FontResolver;

  /**
   * The theme's heading (major) and body (minor) fonts; runs in them are written as theme
   * references.
   */
  theme: { major: FontChoice; minor: FontChoice };

  /**
   * The fonts embedded in the presentation (`p:embeddedFontLst`).
   */
  embedded: readonly EmbeddedFont[];
};

/**
 * One embedded font family: its typeface and the font data of each style PowerPoint has a slot for.
 */
export type EmbeddedFont = {
  /**
   * The family name runs refer to.
   */
  typeface: string;

  /**
   * The PANOSE classification as 20 hex digits, if known.
   */
  panose?: string;

  /**
   * The pitch and family byte, if known.
   */
  pitchFamily?: number;

  /**
   * The character set, if known.
   */
  charset?: number;

  /**
   * The embedded data of each style, in the format PowerPoint reads from `.fntdata` parts.
   */
  styles: Partial<Record<'regular' | 'bold' | 'italic' | 'boldItalic', Uint8Array>>;
};
