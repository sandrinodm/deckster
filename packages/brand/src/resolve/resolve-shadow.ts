import type { ShadowLayerTokens, ShadowTokens } from '#resolve/brand-tokens.ts';
import type { ColorResolver } from '#resolve/color-resolver.ts';
import type { Shadow, ShadowName } from '#schema/shape-schema.ts';

import { formatHex, fromHex, type Rgba } from '#color/color.ts';
import { cssNumber, cssPx } from '#compile/css-syntax.ts';

/**
 * The largest value of an 8-bit channel.
 */
const CHANNEL_MAX = 255;

/**
 * Decimals kept in a shadow's CSS opacity; `0.06` stays `0.06`.
 */
const ALPHA_DECIMALS = 3;

/**
 * The shadow with no layers.
 */
export const NO_SHADOW: ShadowTokens = {
  /**
   * Nothing is drawn.
   */
  layers: [],

  /**
   * CSS's own value for no shadow.
   */
  css: 'none',
};

/**
 * Resolves shadows by name: each layer's color to hex and opacity, its optional fields defaulted,
 * and the CSS `box-shadow` value.
 *
 * @param shadows - Shadows by name, as the brand writes them.
 * @param path - Their field path, such as `shape.shadow`, for bad references.
 * @param colors - The resolver, which records bad references.
 */
export function resolveShadows<Name extends ShadowName>(
  shadows: Readonly<Partial<Record<Name, Shadow>>>,
  path: string,
  colors: ColorResolver,
): Partial<Record<Name, ShadowTokens>> {
  const entries = Object.entries(shadows) as [Name, Shadow | undefined][];
  return Object.fromEntries(
    entries.flatMap(([name, shadow]) =>
      shadow === undefined ? [] : [[name, resolveShadow(shadow, `${path}.${name}`, colors)]],
    ),
  ) as Partial<Record<Name, ShadowTokens>>;
}

/**
 * A diagram card's shadow in the two forms the kit paints it: a CSS `filter` for an outline that is
 * not a box (one `drop-shadow()` per outer layer, in the shadow's order; `drop-shadow()` has no
 * spread, so spread is dropped), and a `box-shadow` for HTML parts, whose filter would also shadow
 * their text and children (the same layers, spread kept). Inset layers are left out of both; a
 * shadow with no outer layer gives `none` for both.
 *
 * @param shadow - A resolved shadow.
 * @returns The outer layers, the `filter` value and the `box-shadow` value.
 */
export function cardShadow(shadow: ShadowTokens): {
  layers: ShadowLayerTokens[];
  filter: string;
  boxShadow: string;
} {
  const layers = shadow.layers.filter((layer) => !layer.inset);
  if (layers.length === 0) {
    return { layers, filter: 'none', boxShadow: 'none' };
  }

  const colored = layers.map((layer) => ({
    layer,
    color: { ...fromHex(layer.color), alpha: layer.alpha },
  }));
  const filter = colored.map(
    ({ layer, color }) =>
      `drop-shadow(${length(layer.x)} ${length(layer.y)} ${length(layer.blur)} ${rgb(color)})`,
  );
  const boxShadow = colored.map(({ layer, color }) => layerCss(layer, color));
  return { layers, filter: filter.join(' '), boxShadow: boxShadow.join(', ') };
}

/**
 * One shadow resolved.
 *
 * @param shadow - The shadow as the brand writes it.
 * @param path - Its field path, for bad references.
 * @param colors - The resolver, which records bad references.
 */
function resolveShadow(shadow: Shadow, path: string, colors: ColorResolver): ShadowTokens {
  if (shadow === 'none') {
    return NO_SHADOW;
  }

  const resolved = shadow.map((layer, index) => {
    const color = colors.rgba(layer.color, `${path}[${index}].color`);
    const tokens: ShadowLayerTokens = {
      x: layer.x ?? 0,
      y: layer.y,
      blur: layer.blur,
      spread: layer.spread ?? 0,
      color: formatHex({ ...color, alpha: 1 }),
      alpha: color.alpha,
      inset: layer.inset ?? false,
    };
    return { tokens, css: layerCss(tokens, color) };
  });
  return {
    layers: resolved.map((layer) => layer.tokens),
    css: resolved.map((layer) => layer.css).join(', '),
  };
}

/**
 * One layer as CSS: `[inset] x y blur [spread] rgb(r g b / a)`, the spread only when it is not 0
 * and the opacity as written, not rounded to 8 bits.
 *
 * @param layer - The resolved layer.
 * @param color - Its color with the exact opacity.
 */
function layerCss(layer: ShadowLayerTokens, color: Rgba): string {
  const parts = [
    ...(layer.inset ? ['inset'] : []),
    length(layer.x),
    length(layer.y),
    length(layer.blur),
    ...(layer.spread === 0 ? [] : [length(layer.spread)]),
    rgb(color),
  ];
  return parts.join(' ');
}

/**
 * A length in CSS pixels, `0` without a unit.
 */
function length(value: number): string {
  return value === 0 ? '0' : cssPx(value);
}

/**
 * A color as CSS `rgb()`, with its opacity when it is translucent.
 */
function rgb(color: Rgba): string {
  const channels = [color.r, color.g, color.b]
    .map((channel) => Math.round(Math.min(1, Math.max(0, channel)) * CHANNEL_MAX))
    .join(' ');
  if (color.alpha >= 1) {
    return `rgb(${channels})`;
  }

  return `rgb(${channels} / ${cssNumber(Number(color.alpha.toFixed(ALPHA_DECIMALS)))})`;
}
