import type { ColorResolver } from '#resolve/color-resolver.ts';
import type { Brand } from '#schema/brand-schema.ts';
import type { BrandProblem } from '#validate/brand-error.ts';

import { formatHex } from '#color/color.ts';
import { coversWithPicture } from '#resolve/resolve-background.ts';

/**
 * Scales an alpha from 0 to 1 to the percentage that messages show.
 */
const PERCENT = 100;

/**
 * Checks that every background a brand writes is opaque: the base `bg`, each surface's `bg` and
 * each chart plate. What shows through a translucent background is not part of the brand, so its
 * contrast could not be checked and it would look different on every page. Translucent cards
 * (`surface`), borders and gradient colors are fine: they are painted over a background first.
 *
 * @param brand - The decoded brand.
 * @param colors - The brand's color resolver.
 * @returns One problem per translucent background.
 */
export function checkOpaqueBackgrounds(brand: Brand, colors: ColorResolver): BrandProblem[] {
  const fields = [
    { path: 'color.roles.bg', ref: brand.color.roles.bg },
    ...Object.entries(brand.color.surfaces).flatMap(([name, surface]) => [
      { path: `color.surfaces.${name}.bg`, ref: surface.bg },
      { path: `color.surfaces.${name}.data.plate`, ref: surface.data?.plate },
    ]),
  ];
  return fields.flatMap(({ path, ref }) => {
    if (ref === undefined) {
      return [];
    }

    const color = colors.rgba(ref, path);
    if (color.alpha >= 1) {
      return [];
    }

    const solid = formatHex({ ...color, alpha: 1 });
    return [
      {
        path,
        message:
          `"${ref}" is ${Math.round(color.alpha * PERCENT)}% opaque; a background must be ` +
          'opaque, since what shows through it is not part of the brand and its contrast ' +
          'cannot be checked.',
        fix:
          `Use an opaque color such as "${solid}" (the same color without its alpha). ` +
          'For a tinted background, mix the tint yourself and write the result.',
      },
    ];
  });
}

/**
 * Checks that every surface whose layers cover it with a picture (an `image` or a `pattern` layer)
 * sets its own `bg`: the color the background reads as. Contrast, the chart plate, the color scheme
 * and solid-color exports use it, so it has to be a choice, not the base `bg` or a gradient's first
 * color that happens to sit under the picture.
 *
 * @param brand - The decoded brand.
 * @returns One problem per surface without its own `bg`.
 */
export function checkPictureBackgrounds(brand: Brand): BrandProblem[] {
  return Object.entries(brand.color.surfaces).flatMap(([name, surface]) =>
    surface.bg === undefined && coversWithPicture(surface.background ?? [])
      ? [
          {
            path: `color.surfaces.${name}.bg`,
            message:
              `The ${name} surface paints an image or pattern layer but sets no \`bg\`, so ` +
              'nothing says what color its background reads as.',
            fix:
              'Set `bg` to the color the picture reads as from a distance (its average under ' +
              'the text, with any tint laid over it), such as "ink.900"; text contrast is ' +
              'checked against it and `deckster lint` measures the pixels.',
          },
        ]
      : [],
  );
}
