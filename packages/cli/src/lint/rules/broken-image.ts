import type { SlideRule } from '#lint/types.ts';

import { imageName } from '#lint/rules/low-res-image.ts';

/**
 * An `<img>` that failed to load: a path that does not exist, a file the server cannot read or a
 * URL that is down. The browser draws a broken-image icon or nothing, so the slide is missing what
 * it points at. SVG images are checked too; an image hidden by its component (such as a placeholder
 * the kit's `Image` draws for a missing file) is not visible and not recorded.
 */
export const brokenImageRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'broken-image',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * Images can appear on any step.
   */
  scope: 'step',

  /**
   * A missing image breaks the slide.
   */
  severity: 'error',

  /**
   * The sentence `deckster lint --help` lists for the rule.
   */
  description: 'An image failed to load, so the slide shows a broken image or nothing.',

  /**
   * Reports each visible image that loaded no pixels.
   */
  check: ({ snapshot }) =>
    snapshot.elements.flatMap((element) => {
      const image = element.image;
      if (image === null || image.naturalWidth > 0 || image.naturalHeight > 0) {
        return [];
      }

      return [
        {
          message: `${imageName(image)} did not load (${image.src}).`,
          fix:
            "Import the file from the deck's assets/ folder (`import photo from " +
            "'../assets/photo.jpg'`), put it in public/ and use its path from the deck root, " +
            'or fix the URL.',
          selector: element.selector,
        },
      ];
    }),
};
