import type { ReactNode } from 'react';

import { defineLayout, type LayoutProps } from '@deckster/engine';

import type { CoverPicture, titleLayoutContract } from '#layouts/title-layout.contract.ts';

import { treatmentProps } from '#layout-fields.ts';
import {
  BrandLogo,
  Eyebrow,
  FittedText,
  Frame,
  smartPunctuation,
  TreatedMedia,
  useEnter,
} from '#layout-parts.ts';
import '#layouts/display-align.css';
import '#layouts/image-layout.css';
import '#layouts/title-layout.css';

/**
 * The most lines the deck title takes before it steps down in size.
 */
const TITLE_MAX_LINES = 3;

/**
 * The cover logo's height, as a multiple of the brand's chrome logo height.
 */
const COVER_LOGO_SCALE = 1.5;

/**
 * The `title` layout: the brand logo on the top line; eyebrow, deck title and subtitle standing on
 * a rule above the bottom line; the byline and date under the rule. With media, the photo fills the
 * right five columns to the slide edges and the text keeps to the left; with `picture: full` it
 * covers the slide, and the logo and the text block each sit on a dark scrim of their own, in light
 * text whatever the surface. Without media, `align: center` centres the logo, the text block and
 * the byline row on the slide, the text block midway between the logo and the byline row.
 */
function TitleLayout({ frontmatter, slots }: LayoutProps<typeof titleLayoutContract>): ReactNode {
  const hasMedia = slots.media !== undefined;
  const isFull = hasMedia && frontmatter.picture === 'full';
  const metaEnter = useEnter(2);
  const hasMeta = frontmatter.byline !== undefined || frontmatter.date !== undefined;
  const main = (
    <CoverMain eyebrow={frontmatter.eyebrow} title={frontmatter.title}>
      {slots.body}
    </CoverMain>
  );
  const meta = hasMeta ? (
    <div className="kit-cover-meta kit-type-small" {...metaEnter}>
      <CoverMeta byline={frontmatter.byline} date={frontmatter.date} />
    </div>
  ) : null;
  return (
    <Frame
      layout="title"
      variant={{
        'data-media': String(hasMedia),
        'data-picture': hasMedia ? frontmatter.picture : undefined,
        'data-align': hasMedia ? 'left' : frontmatter.align,
      }}
      backdrop={!isFull}
      bleed={
        hasMedia ? (
          <CoverPhoto treatment={frontmatter.treatment}>{slots.media}</CoverPhoto>
        ) : undefined
      }>
      <div className="kit-cover-text">
        <div className="kit-cover-logo">
          {isFull ? <PhotoScrim at="top-left" /> : null}
          <BrandLogo scale={COVER_LOGO_SCALE} onDark={isFull} />
        </div>
        {isFull ? (
          <div className="kit-cover-band">
            <PhotoScrim at="bottom-left" />
            {main}
            {meta}
          </div>
        ) : (
          <>
            {main}
            {meta}
          </>
        )}
      </div>
    </Frame>
  );
}

/**
 * Props of {@link CoverMain}.
 */
type CoverMainProps = {
  /**
   * The eyebrow above the title, if any.
   */
  eyebrow: string | undefined;

  /**
   * The deck title.
   */
  title: string | undefined;

  /**
   * The subtitle, the body slot, if the slide fills it.
   */
  children: ReactNode;
};

/**
 * The cover's text block: the eyebrow, the deck title in the display style (stepping down rather
 * than taking a fourth line) and the subtitle in the lead style.
 */
function CoverMain({ eyebrow, title, children }: CoverMainProps): ReactNode {
  const enter = useEnter(0);
  return (
    <div className="kit-cover-main" {...enter}>
      <Eyebrow text={eyebrow} />
      <FittedText
        as="h1"
        className="kit-cover-title kit-heading kit-type-display"
        maxLines={TITLE_MAX_LINES}
        boundary=".kit-cover-text">
        {title}
      </FittedText>
      {children === undefined ? null : (
        <div className="kit-cover-subtitle kit-prose" data-text="lead">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Props of {@link CoverPhoto}.
 */
type CoverPhotoProps = {
  /**
   * The slide's `treatment:`, if it names one.
   */
  treatment: string | undefined;

  /**
   * The media slot: the photo.
   */
  children: ReactNode;
};

/**
 * The cover photo, cropped to its frame in the brand's image treatment: the right five columns, or
 * the whole slide with `picture: full` (the stylesheet sizes it).
 */
function CoverPhoto({ treatment, children }: CoverPhotoProps): ReactNode {
  const enter = useEnter(0);
  return (
    <div className="kit-cover-media" {...enter}>
      <TreatedMedia className="kit-cover-frame" rounded={false} {...treatmentProps(treatment)}>
        {children}
      </TreatedMedia>
    </div>
  );
}

/**
 * Props of {@link PhotoScrim}.
 */
type PhotoScrimProps = {
  /**
   * The corner of the slide the scrim grows from, behind the block it backs.
   */
  at: 'top-left' | 'bottom-left';
};

/**
 * The dark scrim behind a block of the cover over a full-bleed photo: the image layout's scrim,
 * drawn inside the block so it is as large as the block, solid enough under the text that light
 * text keeps its contrast on a white photo and fading out away from it. Decoration: `deckster lint`
 * measures the text against the photo and scrim as painted.
 */
function PhotoScrim({ at }: PhotoScrimProps): ReactNode {
  return <span className="kit-image-scrim" data-at={at} aria-hidden="true" data-decorative="" />;
}

/**
 * Props of {@link CoverMeta}.
 */
type CoverMetaProps = {
  /**
   * Who presents, if the slide says.
   */
  byline: string | undefined;

  /**
   * When, if the slide says.
   */
  date: string | undefined;
};

/**
 * The byline at the start of the cover's bottom row and the date at its end.
 */
function CoverMeta({ byline, date }: CoverMetaProps): ReactNode {
  return (
    <>
      {byline === undefined ? null : <span>{smartPunctuation(byline)}</span>}
      {date === undefined ? null : <span className="kit-numeric">{smartPunctuation(date)}</span>}
    </>
  );
}

/**
 * The `title` layout's component. A cover photo covers the right edge, or every edge when it fills
 * the slide, so the chrome moves off them.
 */
export const titleLayout = defineLayout<typeof titleLayoutContract>({
  name: 'title',
  component: TitleLayout,
  bleed: ({ frontmatter, slots }) => coverBleed(slots.includes('media'), frontmatter.picture),
});

/**
 * The edges a cover photo covers: none without one, the right edge beside the text, every edge when
 * it fills the slide.
 *
 * @param hasMedia - Whether the slide fills `<Media>`.
 * @param picture - The slide's `picture:`.
 */
function coverBleed(
  hasMedia: boolean,
  picture: CoverPicture,
): ('left' | 'right' | 'top' | 'bottom')[] {
  if (!hasMedia) {
    return [];
  }

  return picture === 'full' ? ['left', 'right', 'top', 'bottom'] : ['right'];
}
