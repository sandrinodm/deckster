import type { CSSProperties, ReactNode } from 'react';

import { defineLayout, type LayoutProps } from '@deckster/engine';

import type { imageLayoutContract } from '#layouts/image-layout.contract.ts';

import { TreatedMedia } from '#foundation/media-treatment.tsx';
import { Eyebrow, FittedText, Frame } from '#foundation/slide-parts.tsx';
import { treatmentProps } from '#layouts/layout-fields.ts';
import { useEnter } from '#motion/enter.ts';
import '#layouts/image-layout.css';

/**
 * The most lines the title takes over the photo before it steps down in size.
 */
const TITLE_MAX_LINES = 2;

/**
 * Props of {@link Scrim}.
 */
type ScrimProps = {
  /**
   * The edge or corner of the slide the scrim grows from, behind the text it backs.
   */
  at: 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
};

/**
 * The dark scrim behind one block of text over the photo, drawn inside that block so it is exactly
 * as large as the text: solid enough under every glyph that light text keeps 4.5:1 on a white
 * photo, fading to clear away from it. Decoration: `deckster lint` measures the text against the
 * photo and scrim as painted, and the PPTX export draws it as a gradient.
 */
function Scrim({ at }: ScrimProps): ReactNode {
  return <span className="kit-image-scrim" data-at={at} aria-hidden="true" data-decorative="" />;
}

/**
 * The corner a title's scrim grows from when the text sits in a third of the slide: the top corner
 * on the side the text is on.
 *
 * @param text - The third the text sits in.
 */
function sideScrimAt(text: 'left' | 'right'): ScrimProps['at'] {
  return text === 'left' ? 'top-left' : 'top-right';
}

/**
 * The `image` layout: the photo covers the slide edge to edge, cropped around `focal`. The text
 * block (eyebrow, title, a line of text) stands on the bottom line across eight columns with the
 * caption at the other end of the same band, or sits in the left or right third from the top line
 * with the caption in the opposite bottom corner. Text over the photo is always light on a dark
 * scrim, whatever the slide's surface: each block of text carries its own scrim, sized to it, and
 * the photo alone (`text: none`) has none but the caption's.
 */
function ImageLayout({ frontmatter, slots }: LayoutProps<typeof imageLayoutContract>): ReactNode {
  const textEnter = useEnter(1);
  const { text } = frontmatter;
  // The focal point is a custom property, which CSSProperties does not list.
  const focalStyle = { '--kit-focal': frontmatter.focal ?? 'center' } as CSSProperties;
  const photo = (
    <div className="kit-image-media" style={focalStyle}>
      <TreatedMedia
        className="kit-image-frame"
        rounded={false}
        {...treatmentProps(frontmatter.treatment)}>
        {slots.media}
      </TreatedMedia>
    </div>
  );
  const titleScrim = text === 'left' || text === 'right' ? <Scrim at={sideScrimAt(text)} /> : null;
  const bodyLine =
    slots.body === undefined ? null : (
      <div className="kit-image-body kit-prose" data-text="lead">
        {slots.body}
      </div>
    );
  const textBlock =
    text === 'none' ? null : (
      <div className="kit-image-text" {...textEnter}>
        {titleScrim}
        <Eyebrow text={frontmatter.eyebrow} />
        <FittedText
          as="h2"
          className="kit-image-title kit-heading kit-type-headline"
          maxLines={TITLE_MAX_LINES}
          boundary=".kit-safe">
          {frontmatter.title}
        </FittedText>
        {bodyLine}
      </div>
    );
  const captionCorner = text === 'right' || text === 'none' ? 'bottom-left' : 'bottom-right';
  const captionScrim = text === 'bottom' ? null : <Scrim at={captionCorner} />;
  const caption =
    slots.caption === undefined ? null : (
      <div className="kit-image-caption kit-type-caption" data-at={captionCorner}>
        {captionScrim}
        {slots.caption}
      </div>
    );
  return (
    <Frame layout="image" variant={{ 'data-text': text }} bleed={photo} backdrop={false}>
      {text === 'bottom' ? (
        <div className="kit-image-band">
          <Scrim at="bottom" />
          {textBlock}
          {caption}
        </div>
      ) : (
        <>
          {textBlock}
          {caption}
        </>
      )}
    </Frame>
  );
}

/**
 * The `image` layout's component. The photo covers every edge, so the chrome moves off all of them.
 */
export const imageLayout = defineLayout<typeof imageLayoutContract>({
  name: 'image',
  component: ImageLayout,
  bleed: () => ['left', 'right', 'top', 'bottom'],
});
