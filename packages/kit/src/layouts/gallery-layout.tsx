import type { ReactNode } from 'react';

import { defineLayout, useStatic, type LayoutProps } from '@deckster/engine';

import type { galleryLayoutContract } from '#layouts/gallery-layout.contract.ts';

import { FrontmatterPicture } from '#foundation/frontmatter-picture.tsx';
import { Footnote, Frame, Region, SlideHeader } from '#foundation/slide-parts.tsx';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { enterProps, useEnter } from '#motion/enter.ts';
import '#layouts/gallery-layout.css';

/**
 * The entrance order of the lead picture; the header and context come before, the other pictures
 * after it.
 */
const FIRST_PICTURE_ORDER = 2;

/**
 * The `gallery` layout: the shared header and an optional line of context, then the pictures in one
 * grid down to the bottom line. The lead takes the left two thirds with two pictures (the other a
 * tall frame beside it, as a phone screen needs), the left seven columns with three (the others
 * stacked beside it) and the left half with four (one wide frame and two small ones beside it).
 * Each picture fills its frame in the brand's image treatment, cropped around `focal`, or shown
 * whole with `fit: contain`; its caption stands under it, outside the picture, so no text is ever
 * set over a photo.
 */
function GalleryLayout({
  frontmatter,
  slots,
}: LayoutProps<typeof galleryLayoutContract>): ReactNode {
  const isStatic = useStatic();
  const contextEnter = useEnter(1);
  const { pictures, treatment } = frontmatter;
  return (
    <Frame layout="gallery" variant={{ 'data-count': String(pictures.length) }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} />
      {slots.body === undefined ? null : (
        <div className="kit-gallery-context kit-prose kit-body" {...contextEnter}>
          {slots.body}
        </div>
      )}
      <Region className="kit-gallery-region">
        <div className="kit-gallery">
          {pictures.map((picture, index) => (
            <figure
              key={index}
              className="kit-gallery-item"
              data-index={index}
              {...enterProps(FIRST_PICTURE_ORDER + index, isStatic)}>
              <FrontmatterPicture
                className="kit-gallery-frame"
                src={picture.src}
                alt={picture.alt}
                fit={picture.fit}
                focal={picture.focal}
                treatment={treatment}
              />
              {picture.caption === undefined ? null : (
                <figcaption className="kit-gallery-caption kit-type-caption">
                  {smartPunctuation(picture.caption)}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      </Region>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

/**
 * The `gallery` layout's component.
 */
export const galleryLayout = defineLayout<typeof galleryLayoutContract>({
  name: 'gallery',
  component: GalleryLayout,
});
