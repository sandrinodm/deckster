import type { BackgroundLayerTokens, GradientTokens } from '#resolve/brand-tokens.ts';
import type { ColorResolver } from '#resolve/color-resolver.ts';
import type { BackgroundLayer } from '#schema/background-schema.ts';

import { ownValue } from '#resolve/own-value.ts';

/**
 * Where an image's focal point is when its layer gives none: the middle.
 */
const CENTER = {
  /**
   * Half the image's width.
   */
  x: 50,

  /**
   * Half the image's height.
   */
  y: 50,
} as const;

/**
 * No offset from an anchor or from the top left corner.
 */
const NO_OFFSET = {
  /**
   * Canvas pixels to the right.
   */
  x: 0,

  /**
   * Canvas pixels down.
   */
  y: 0,
} as const;

/**
 * Resolves a surface's background layers: fills in defaults (cover, centered, opaque, unrotated)
 * and resolves tint colors to hex and gradient names to their CSS. A gradient a layer names that
 * does not exist is left out here; the reference checks report it.
 *
 * @param layers - The layers as the brand writes them.
 * @param path - The `background` field's path, such as `color.surfaces.photo.background`.
 * @param colors - The brand's color resolver, which records bad references.
 * @param gradients - Every gradient, already compiled.
 */
export function resolveBackgroundLayers(
  layers: readonly BackgroundLayer[],
  path: string,
  colors: ColorResolver,
  gradients: Readonly<Record<string, GradientTokens>>,
): BackgroundLayerTokens[] {
  return layers.flatMap((layer, index): BackgroundLayerTokens[] => {
    const opacity = layer.opacity ?? 1;
    switch (layer.type) {
      case 'image': {
        return [
          {
            type: 'image',
            file: layer.file,
            fit: layer.fit ?? 'cover',
            focal: layer.focal ?? CENTER,
            opacity,
            treatment: layer.treatment,
            tint:
              layer.tint === undefined
                ? undefined
                : {
                    color: colors.hex(layer.tint.color, `${path}[${index}].tint.color`),
                    opacity: layer.tint.opacity,
                  },
          },
        ];
      }

      case 'placed': {
        return [
          {
            type: 'placed',
            file: layer.file,
            aspect: layer.aspect,
            anchor: layer.anchor,
            width: layer.width,
            offset: layer.offset ?? NO_OFFSET,
            opacity,
            rotate: layer.rotate ?? 0,
          },
        ];
      }

      case 'pattern': {
        return [
          {
            type: 'pattern',
            file: layer.file,
            aspect: layer.aspect,
            tile: layer.tile,
            offset: layer.offset ?? NO_OFFSET,
            opacity,
          },
        ];
      }

      case 'gradient': {
        const gradient = ownValue(gradients, layer.gradient);
        return gradient === undefined
          ? []
          : [{ type: 'gradient', gradient: layer.gradient, css: gradient.css, opacity }];
      }
    }
  });
}

/**
 * Whether a surface's layers cover its color with a picture, so the color only says what the
 * background reads as: an image or a pattern does, a placed mark or a gradient layer does not.
 *
 * @param layers - The surface's layers, written or resolved.
 */
export function coversWithPicture(layers: readonly { type: string }[]): boolean {
  return layers.some((layer) => layer.type === 'image' || layer.type === 'pattern');
}
