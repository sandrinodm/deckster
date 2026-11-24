import type { ReactNode } from 'react';

import { defineLayout, type LayoutProps } from '@deckster/engine';

import type { sectionLayoutContract } from '#layouts/section-layout.contract.ts';

import { treatmentProps } from '#layout-fields.ts';
import { Eyebrow, FittedText, Frame, TreatedMedia, useEnter } from '#layout-parts.ts';
import '#layouts/display-align.css';
import '#layouts/section-layout.css';

/**
 * The most lines a part title takes before it steps down in size.
 */
const SECTION_TITLE_MAX_LINES = 2;

/**
 * The most lines a part title takes beside a photo, in seven columns, before it steps down.
 */
const SECTION_TITLE_MAX_LINES_WITH_MEDIA = 3;

/**
 * The digits a numeric part number is padded to: 2 becomes `02`.
 */
const NUMBER_DIGITS = 2;

/**
 * The length from which the large numeral is set a size smaller (`data-chars="3"`), so the longest
 * number a divider takes (three characters) keeps to the slide's width.
 */
const NUMERAL_WIDE_CHARS = 3;

/**
 * The `section` layout: the part number set large on the top line, and the eyebrow, part title and
 * summary standing on the bottom line. The summary's two lines are kept free when it is left out,
 * so every divider of a deck sets its title at the same height. `numeral: large` sets the number as
 * a graphic in the surface's tone behind the text instead, running off the bottom edge. Setting
 * `align: center` centres the number and the text block on the slide. A photo fills the right five
 * columns to the slide edges and keeps the text on the left.
 */
function SectionLayout({
  frontmatter,
  slots,
}: LayoutProps<typeof sectionLayoutContract>): ReactNode {
  const numberEnter = useEnter(0);
  const mainEnter = useEnter(1);
  const number = formatNumber(frontmatter.number);
  const hasMedia = slots.media !== undefined;
  const isLarge = frontmatter.numeral === 'large' && number !== undefined;
  const align = hasMedia ? 'left' : frontmatter.align;
  const numeral = isLarge ? <LargeNumeral number={number} /> : null;
  const media = hasMedia ? (
    <SectionPhoto treatment={frontmatter.treatment}>{slots.media}</SectionPhoto>
  ) : null;
  return (
    <Frame
      layout="section"
      variant={{
        'data-display-align': '',
        'data-align': align,
        'data-numeral': isLarge ? 'large' : 'small',
        'data-media': String(hasMedia),
      }}
      bleed={
        <>
          {numeral}
          {media}
        </>
      }>
      {number === undefined || isLarge ? null : (
        <p className="kit-section-number kit-type-display kit-numeric" {...numberEnter}>
          {number}
        </p>
      )}
      <div className="kit-section-main" {...mainEnter}>
        <Eyebrow text={frontmatter.eyebrow} />
        <FittedText
          as="h2"
          className="kit-section-title kit-heading kit-type-display"
          maxLines={hasMedia ? SECTION_TITLE_MAX_LINES_WITH_MEDIA : SECTION_TITLE_MAX_LINES}
          boundary=".kit-safe">
          {frontmatter.title}
        </FittedText>
        <div className="kit-section-summary kit-prose" data-text="lead">
          {slots.body}
        </div>
      </div>
    </Frame>
  );
}

/**
 * Props of {@link LargeNumeral}.
 */
type LargeNumeralProps = {
  /**
   * The part number as shown, such as `02`.
   */
  number: string;
};

/**
 * The part number as a graphic behind the text (`numeral: large`): decoration, which assistive
 * technology and `deckster lint`'s text and overflow rules skip, sized by how many characters it
 * has.
 */
function LargeNumeral({ number }: LargeNumeralProps): ReactNode {
  const enter = useEnter(0);
  return (
    <p
      className="kit-section-numeral kit-numeric"
      aria-hidden="true"
      data-decorative=""
      data-chars={String(Math.min(number.length, NUMERAL_WIDE_CHARS))}
      {...enter}>
      {number}
    </p>
  );
}

/**
 * Props of {@link SectionPhoto}.
 */
type SectionPhotoProps = {
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
 * The divider's photo, in the right five columns to the slide edges, cropped in the brand's image
 * treatment.
 */
function SectionPhoto({ treatment, children }: SectionPhotoProps): ReactNode {
  const enter = useEnter(0);
  return (
    <div className="kit-section-media" {...enter}>
      <TreatedMedia className="kit-section-frame" rounded={false} {...treatmentProps(treatment)}>
        {children}
      </TreatedMedia>
    </div>
  );
}

/**
 * The part number as shown: whole numbers padded to two digits, text as written.
 *
 * @param number - The `number` field, if the slide sets one.
 */
function formatNumber(number: number | string | undefined): string | undefined {
  if (typeof number === 'number') {
    return String(number).padStart(NUMBER_DIGITS, '0');
  }

  return number;
}

/**
 * The `section` layout's component. A photo covers the right edge, so the chrome moves off it.
 */
export const sectionLayout = defineLayout<typeof sectionLayoutContract>({
  name: 'section',
  component: SectionLayout,
  bleed: ({ slots }) => (slots.includes('media') ? ['right'] : []),
});
