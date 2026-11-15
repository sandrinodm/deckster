import { Schema } from 'effect';

import { ColorRef, FiniteBetween, KebabName, Percent } from '#schema/primitives.ts';

/**
 * The most grain a gradient may carry; beyond this the noise reads as dirt, not texture.
 */
export const MAX_GRAIN_OPACITY = 0.4;

/**
 * A gradient stop: a color, optionally at a position in percent.
 */
const Stop = Schema.Union([ColorRef, Schema.Struct({ color: ColorRef, at: Percent })]).annotate({
  message: 'Expected a color, or a stop such as { color: "ink.900", at: 40 }',
});

/**
 * A linear or radial gradient's stops, at least two.
 */
const Stops = Schema.Array(Stop).check(
  Schema.isMinLength(2, { message: 'Expected at least two stops' }),
);

/**
 * Noise over the gradient, given as its opacity.
 */
const Grain = Schema.Finite.check(
  Schema.isBetween(
    { minimum: 0, maximum: MAX_GRAIN_OPACITY },
    { message: `Expected a grain opacity from 0 to ${MAX_GRAIN_OPACITY}` },
  ),
);

/**
 * A gradient angle in degrees, one turn either way.
 */
const Angle = FiniteBetween(-360, 360, 'Expected an angle in degrees from -360 to 360');

/**
 * A point on the slide in percent of its width and height.
 */
const Position = Schema.Struct({ x: Percent, y: Percent });

/**
 * A straight gradient at an angle.
 */
const LinearGradient = Schema.Struct({
  type: Schema.Literal('linear'),
  /**
   * CSS degrees: 0 points up, 90 points right.
   */
  angle: Angle,
  stops: Stops,
  grain: Schema.optionalKey(Grain),
});

/**
 * A gradient from a center outward, an ellipse unless it says `circle`.
 */
const RadialGradient = Schema.Struct({
  type: Schema.Literal('radial'),
  shape: Schema.optionalKey(Schema.Literals(['circle', 'ellipse'])),
  at: Schema.optionalKey(Position),
  stops: Stops,
  grain: Schema.optionalKey(Grain),
});

/**
 * A soft glow of color centred at `x`, `y` and fading out over `size` percent of the slide.
 */
const MeshPoint = Schema.Struct({
  color: ColorRef,
  x: Percent,
  y: Percent,
  size: Schema.optionalKey(Percent),
});

/**
 * Several glows layered over a base color, the usual way to fake a mesh gradient in CSS.
 */
const MeshGradient = Schema.Struct({
  type: Schema.Literal('mesh'),
  base: ColorRef,
  points: Schema.Array(MeshPoint).check(
    Schema.isMinLength(1, { message: 'Expected at least one point' }),
  ),
  grain: Schema.optionalKey(Grain),
});

/**
 * A named gradient: linear, radial or mesh, with optional grain.
 */
export const Gradient = Schema.Union([LinearGradient, RadialGradient, MeshGradient]).annotate({
  message: 'Expected a gradient whose type is "linear", "radial" or "mesh"',
});

/**
 * A decoded gradient.
 */
export type Gradient = typeof Gradient.Type;

/**
 * The `gradients` section of a brand.
 */
export const BrandGradients = Schema.Record(KebabName('gradient name', 'aurora'), Gradient);
