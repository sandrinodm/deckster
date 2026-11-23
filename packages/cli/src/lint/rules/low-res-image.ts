import type { ElementSnapshot, ImageSnapshot, SlideRule } from '#lint/types.ts';

import { MIN_IMAGE_RESOLUTION_RATIO } from '#lint/limits.ts';

/**
 * The query string or fragment of a URL.
 */
const URL_SUFFIX_PATTERN = /[?#].*$/;

/**
 * A raster image drawn larger than its own pixels on a 1x (1920x1080) render, which looks soft when
 * projected and in exports. SVG images are skipped.
 */
export const lowResImageRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'low-res-image',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * Images can appear on any step.
   */
  scope: 'step',

  /**
   * A soft image does not break the slide.
   */
  severity: 'warning',

  /**
   * The sentence `deckster lint --help` lists for the rule.
   */
  description: 'A raster image has fewer pixels than the size it is drawn at on the 1x canvas.',

  /**
   * Reports each image whose intrinsic size is below its drawn size.
   */
  check: ({ snapshot }) =>
    snapshot.elements.flatMap((element) => {
      const image = element.image;
      if (image === null || image.vector || image.naturalWidth === 0) {
        return [];
      }

      if (!isUpscaled(element, image)) {
        return [];
      }

      const drawn = `${Math.round(element.rect.width)}x${Math.round(element.rect.height)}`;
      return [
        {
          message:
            `${imageName(image)} is ${image.naturalWidth}x${image.naturalHeight} ` +
            `pixels but is drawn at ${drawn} canvas pixels.`,
          fix:
            `Use an image at least ${drawn} pixels (twice that for 2x exports), an SVG, or draw ` +
            'it smaller.',
          selector: element.selector,
        },
      ];
    }),
};

/**
 * Whether an image is drawn larger than its pixels in either direction.
 *
 * @param element - The image element.
 * @param image - Its source and intrinsic size.
 */
function isUpscaled(element: ElementSnapshot, image: ImageSnapshot): boolean {
  const narrower = image.naturalWidth < element.rect.width * MIN_IMAGE_RESOLUTION_RATIO;
  const shorter = image.naturalHeight < element.rect.height * MIN_IMAGE_RESOLUTION_RATIO;
  return narrower || shorter;
}

/**
 * How a message names an image: its file name, or `An inline image` for a data URL.
 *
 * @param image - The image.
 */
export function imageName(image: ImageSnapshot): string {
  if (image.src.startsWith('data:')) {
    return 'An inline image';
  }

  return image.src.replace(URL_SUFFIX_PATTERN, '').split('/').pop() ?? image.src;
}
