import { Schema } from 'effect';

import {
  ColorRef,
  FiniteBetween,
  KebabName,
  MAX_PIXELS,
  Opacity,
  Percent,
  PixelOffset,
} from '#schema/primitives.ts';

/**
 * Background files are SVG or raster images inside the brand folder, such as
 * `backgrounds/paper.jpg`.
 */
const BACKGROUND_FILE_PATTERN = /^(?!\/)(?!.*\.\.)[\w./-]+\.(?:svg|png|webp|jpe?g)$/;

/**
 * The most layers one surface paints; more is a picture made in a drawing tool, not a background.
 */
export const MAX_BACKGROUND_LAYERS = 6;

/**
 * The widest placed or tiled image, as width divided by height.
 */
const MAX_LAYER_ASPECT = 50;

/**
 * The smallest pattern tile in canvas pixels; smaller tiles turn into noise when scaled.
 */
const MIN_TILE_PX = 4;

/**
 * The largest pattern tile in canvas pixels: half the canvas width, or it is not a pattern.
 */
const MAX_TILE_PX = 960;

/**
 * Where a placed image sits on the slide: a corner, the middle of an edge or the center.
 */
export const LAYER_ANCHORS = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
] as const;

/**
 * A placed image's anchor.
 */
export type LayerAnchor = (typeof LAYER_ANCHORS)[number];

/**
 * A path to an image file inside the brand folder.
 */
const LayerFile = Schema.String.check(
  Schema.isPattern(BACKGROUND_FILE_PATTERN, {
    message:
      'Expected a path inside the brand folder to an .svg, .png, .webp or .jpg file, such as ' +
      '"backgrounds/paper.jpg"',
  }),
);

/**
 * A point on the slide or in an image, in percent of its width and height.
 */
const FocalPoint = Schema.Struct({ x: Percent, y: Percent });

/**
 * An offset in canvas pixels; negative values move toward the top and left.
 */
const Offset = Schema.Struct({ x: PixelOffset, y: PixelOffset });

/**
 * Width divided by height, used to size a placed or tiled image before it loads.
 */
const Aspect = Schema.Finite.check(
  Schema.isGreaterThan(0, { message: 'Expected the width divided by the height, such as 1.5' }),
  Schema.isLessThanOrEqualTo(MAX_LAYER_ASPECT, {
    message: `Expected the width divided by the height, at most ${MAX_LAYER_ASPECT}`,
  }),
);

/**
 * A translucent color laid over an image layer, so text reads on a busy photo.
 */
const Tint = Schema.Struct({ color: ColorRef, opacity: Opacity });

/**
 * A photo or texture that fills the slide. `cover` crops it to the slide around `focal`; `contain`
 * shows all of it.
 */
const ImageLayer = Schema.Struct({
  type: Schema.Literal('image'),
  file: LayerFile,
  fit: Schema.optionalKey(Schema.Literals(['cover', 'contain'])),
  focal: Schema.optionalKey(FocalPoint),
  opacity: Schema.optionalKey(Opacity),
  treatment: Schema.optionalKey(KebabName('treatment name', 'duotone')),
  tint: Schema.optionalKey(Tint),
});

/**
 * An image at a fixed place: a corner mark, an edge band, a watermark. `width` is in canvas pixels
 * and `offset` moves it from its anchor; a negative offset lets it run off the edge.
 */
const PlacedLayer = Schema.Struct({
  type: Schema.Literal('placed'),
  file: LayerFile,
  aspect: Aspect,
  anchor: Schema.Literals(LAYER_ANCHORS),
  width: FiniteBetween(1, MAX_PIXELS, `Expected a width in canvas pixels, from 1 to ${MAX_PIXELS}`),
  offset: Schema.optionalKey(Offset),
  opacity: Schema.optionalKey(Opacity),
  rotate: Schema.optionalKey(
    FiniteBetween(-360, 360, 'Expected an angle in degrees from -360 to 360'),
  ),
});

/**
 * An image repeated across the slide, `tile` canvas pixels wide.
 */
const PatternLayer = Schema.Struct({
  type: Schema.Literal('pattern'),
  file: LayerFile,
  aspect: Aspect,
  tile: FiniteBetween(
    MIN_TILE_PX,
    MAX_TILE_PX,
    `Expected a tile width in canvas pixels, from ${MIN_TILE_PX} to ${MAX_TILE_PX}`,
  ),
  offset: Schema.optionalKey(Offset),
  opacity: Schema.optionalKey(Opacity),
});

/**
 * One of the brand's gradients laid over the layers below it: a scrim over a photo, a glow over a
 * pattern.
 */
const GradientLayer = Schema.Struct({
  type: Schema.Literal('gradient'),
  gradient: KebabName('gradient name', 'aurora'),
  opacity: Schema.optionalKey(Opacity),
});

/**
 * A background layer, told apart by its `type`.
 */
export const BackgroundLayer = Schema.Union([
  ImageLayer,
  PlacedLayer,
  PatternLayer,
  GradientLayer,
]).annotate({
  message: 'Expected a background layer whose type is "image", "placed", "pattern" or "gradient"',
});

/**
 * A decoded background layer.
 */
export type BackgroundLayer = typeof BackgroundLayer.Type;

/**
 * A surface's background layers, painted in order over its color and gradient, under the slide's
 * content.
 */
export const BackgroundLayers = Schema.Array(BackgroundLayer).check(
  Schema.isMaxLength(MAX_BACKGROUND_LAYERS, {
    message: `Expected at most ${MAX_BACKGROUND_LAYERS} background layers`,
  }),
);
