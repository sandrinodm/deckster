import type { ReactNode } from 'react';

import { frontmatterAsset } from '#foundation/frontmatter-assets.ts';
import { TreatedMedia } from '#foundation/media-treatment.tsx';
import { useSlideFile } from '#foundation/slide-file.ts';
import '#foundation/frontmatter-picture.css';

/**
 * How a picture takes its frame: `cover` crops it to fill the frame, `contain` shows all of it (a
 * screenshot, a chart) centred on the frame's panel.
 */
export type PictureFit = 'cover' | 'contain';

/**
 * Props of {@link FrontmatterPicture}.
 */
type FrontmatterPictureProps = {
  /**
   * The file as the frontmatter names it (`src: assets/street.jpg`); a plain panel is drawn when it
   * is missing or was not resolved.
   */
  src: string | undefined;

  /**
   * What the picture shows, for people who cannot see it.
   */
  alt: string;

  /**
   * How the picture takes the frame; `cover` when left out.
   */
  fit?: PictureFit | undefined;

  /**
   * The part of a cropped picture to keep in view, as a CSS position; the centre when left out.
   */
  focal?: string | undefined;

  /**
   * A treatment from the brand's imagery; the brand's default when left out.
   */
  treatment?: string | undefined;

  /**
   * Extra classes for the frame, for the layout's size.
   */
  className?: string;
};

/**
 * A picture a layout field names (a tile's or a gallery's `src`), drawn in a frame the layout
 * sizes: the brand's image treatment on the frame (its corners, filter and tint), the picture
 * absolutely placed inside it, so a large file never stretches the grid it sits in. `cover` crops
 * it around `focal`; `contain` shows it whole on the surface's raised panel, for screenshots. A
 * missing file leaves the panel empty, which `deckster lint` reports as missing media.
 */
export function FrontmatterPicture({
  src,
  alt,
  fit = 'cover',
  focal,
  treatment,
  className,
}: FrontmatterPictureProps): ReactNode {
  const source = frontmatterAsset(src, useSlideFile());
  const frameClassName =
    className === undefined ? 'kit-field-picture' : `kit-field-picture ${className}`;
  return (
    <TreatedMedia className={frameClassName} {...(treatment === undefined ? {} : { treatment })}>
      {source === undefined ? null : (
        <img
          className="kit-field-picture-image"
          src={source}
          alt={alt}
          data-fit-picture={fit}
          style={{ objectPosition: focal ?? 'center' }}
        />
      )}
    </TreatedMedia>
  );
}
