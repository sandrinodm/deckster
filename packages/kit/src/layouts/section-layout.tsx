import type { ReactNode } from 'react';

import { defineLayout, type LayoutProps } from '@deckster/engine';

import type { sectionLayoutContract } from '#layouts/section-layout.contract.ts';

import { Eyebrow, FittedText, Frame } from '#foundation/slide-parts.tsx';
import { useEnter } from '#motion/enter.ts';
import '#layouts/section-layout.css';

/**
 * The most lines a part title takes before it steps down in size.
 */
const SECTION_TITLE_MAX_LINES = 2;

/**
 * The digits a numeric part number is padded to: 2 becomes `02`.
 */
const NUMBER_DIGITS = 2;

/**
 * The `section` layout: the part number set large on the top line, and the eyebrow, part title and
 * summary standing on the bottom line. The summary's two lines are kept free when it is left out,
 * so every divider of a deck sets its title at the same height.
 */
function SectionLayout({
  frontmatter,
  slots,
}: LayoutProps<typeof sectionLayoutContract>): ReactNode {
  const numberEnter = useEnter(0);
  const mainEnter = useEnter(1);
  const number = formatNumber(frontmatter.number);
  return (
    <Frame layout="section">
      {number === undefined ? null : (
        <p className="kit-section-number kit-type-display kit-numeric" {...numberEnter}>
          {number}
        </p>
      )}
      <div className="kit-section-main" {...mainEnter}>
        <Eyebrow text={frontmatter.eyebrow} />
        <FittedText
          as="h2"
          className="kit-section-title kit-heading kit-type-display"
          maxLines={SECTION_TITLE_MAX_LINES}
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
 * The `section` layout's component.
 */
export const sectionLayout = defineLayout<typeof sectionLayoutContract>({
  name: 'section',
  component: SectionLayout,
});
