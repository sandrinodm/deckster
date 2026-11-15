import type { ReactNode } from 'react';

import { defineLayout, type LayoutProps } from '@deckster/engine';

import type { titleLayoutContract } from '#layouts/title-layout.contract.ts';

import { BrandLogo } from '#foundation/brand-logo.tsx';
import { TreatedMedia } from '#foundation/media-treatment.tsx';
import { Eyebrow, FittedText, Frame } from '#foundation/slide-parts.tsx';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { treatmentProps } from '#layouts/layout-fields.ts';
import { useEnter } from '#motion/enter.ts';
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
 * right five columns to the slide edges and the text keeps to the left.
 */
function TitleLayout({ frontmatter, slots }: LayoutProps<typeof titleLayoutContract>): ReactNode {
  const hasMedia = slots.media !== undefined;
  const mainEnter = useEnter(0);
  const metaEnter = useEnter(2);
  const mediaEnter = useEnter(0);
  const hasMeta = frontmatter.byline !== undefined || frontmatter.date !== undefined;
  return (
    <Frame
      layout="title"
      variant={{ 'data-media': String(hasMedia) }}
      bleed={
        hasMedia ? (
          <div className="kit-cover-media" {...mediaEnter}>
            <TreatedMedia
              className="kit-cover-frame"
              rounded={false}
              {...treatmentProps(frontmatter.treatment)}>
              {slots.media}
            </TreatedMedia>
          </div>
        ) : undefined
      }>
      <div className="kit-cover-text">
        <div className="kit-cover-logo">
          <BrandLogo scale={COVER_LOGO_SCALE} />
        </div>
        <div className="kit-cover-main" {...mainEnter}>
          <Eyebrow text={frontmatter.eyebrow} />
          <FittedText
            as="h1"
            className="kit-cover-title kit-heading kit-type-display"
            maxLines={TITLE_MAX_LINES}
            boundary=".kit-cover-text">
            {frontmatter.title}
          </FittedText>
          {slots.body === undefined ? null : (
            <div className="kit-cover-subtitle kit-prose" data-text="lead">
              {slots.body}
            </div>
          )}
        </div>
        {hasMeta ? (
          <div className="kit-cover-meta kit-type-small" {...metaEnter}>
            <CoverMeta byline={frontmatter.byline} date={frontmatter.date} />
          </div>
        ) : null}
      </div>
    </Frame>
  );
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
 * The `title` layout's component. A cover photo covers the right edge, so the chrome moves off it.
 */
export const titleLayout = defineLayout<typeof titleLayoutContract>({
  name: 'title',
  component: TitleLayout,
  bleed: ({ slots }) => (slots.includes('media') ? ['right'] : []),
});
