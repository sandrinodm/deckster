import type { ReactNode } from 'react';

import { frontmatterAsset } from '#foundation/frontmatter-assets.ts';
import { initialsOf } from '#foundation/initials.ts';
import { TreatedMedia } from '#foundation/media-treatment.tsx';
import { useSlideFile } from '#foundation/slide-file.ts';
import '#foundation/portrait.css';

/**
 * Where a portrait keeps the face when it is cropped and the slide names no focal point: centred
 * across, in the upper third, where heads sit in most portraits.
 */
const DEFAULT_FOCAL = 'center 30%';

/**
 * Props of {@link Portrait}.
 */
type PortraitProps = {
  /**
   * The person's name: the photo's alt text, and the initials when there is no photo.
   */
  name: string;

  /**
   * The photo as the frontmatter names it; an initials tile is drawn without one, or when the file
   * is missing.
   */
  photo: string | undefined;

  /**
   * The part of the photo to keep when it is cropped, as a CSS position.
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
 * A person's photo cropped to the frame the layout sizes, in the brand's image treatment, with the
 * face kept in view (`focal`, else the upper third), so portraits of any crop line up. Without a
 * photo it draws a tile with the person's initials in the display face, so a member without a photo
 * still reads as one of the set.
 */
export function Portrait({ name, photo, focal, treatment, className }: PortraitProps): ReactNode {
  const source = frontmatterAsset(photo, useSlideFile());
  const frame = className === undefined ? 'kit-portrait' : `kit-portrait ${className}`;
  return (
    <TreatedMedia className={frame} {...(treatment === undefined ? {} : { treatment })}>
      {source === undefined ? (
        <span className="kit-portrait-initials" aria-hidden="true" data-decorative="">
          {initialsOf(name)}
        </span>
      ) : (
        <img
          className="kit-portrait-photo"
          src={source}
          alt={name}
          style={{ objectPosition: focal ?? DEFAULT_FOCAL }}
        />
      )}
    </TreatedMedia>
  );
}
