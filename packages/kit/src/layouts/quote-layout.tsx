import type { ReactNode } from 'react';

import { defineLayout, type LayoutProps } from '@deckster/engine';

import type { FitRung } from '#foundation/fit-text.ts';
import type { quoteLayoutContract } from '#layouts/quote-layout.contract.ts';

import { Portrait } from '#foundation/portrait.tsx';
import { stripQuoteMarks } from '#foundation/quote-marks.ts';
import { Eyebrow, FittedText, Frame, Region } from '#foundation/slide-parts.tsx';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { useEnter } from '#motion/enter.ts';
import '#layouts/quote-layout.css';

/**
 * The sizes a quote tries: the brand's quote style in up to four lines, stepping down, then five
 * lines at the smallest step.
 */
const QUOTE_LADDER: readonly FitRung[] = [
  { scale: 1, maxLines: 4 },
  { scale: 0.88, maxLines: 4 },
  { scale: 0.78, maxLines: 4 },
  { scale: 0.7, maxLines: 5 },
  { scale: 0.62, maxLines: 6 },
];

/**
 * The `quote` layout: the eyebrow on the top line and the quote composed a little above the middle
 * of the space under it, in the brand's quote style with hanging marks, the speaker's name and role
 * under an accent rule. With a photo, the quote keeps to the first seven columns and the portrait
 * stands in the last four, as tall as the slide allows up to 4:5, centred on the quote.
 */
function QuoteLayout({ frontmatter, slots }: LayoutProps<typeof quoteLayoutContract>): ReactNode {
  const hasPortrait = frontmatter.photo !== undefined;
  const quoteEnter = useEnter(0);
  const speakerEnter = useEnter(2);
  const portraitEnter = useEnter(1);
  return (
    <Frame layout="quote" variant={{ 'data-portrait': String(hasPortrait) }}>
      <Eyebrow text={frontmatter.eyebrow} reserve />
      <div className="kit-quote-layout kit-grid">
        <Region className="kit-quote-region" place="optical">
          <figure className="kit-quote" {...quoteEnter}>
            <FittedText
              as="blockquote"
              className="kit-quote-text kit-heading kit-type-quote"
              ladder={QUOTE_LADDER}
              boundary=".kit-region">
              {stripQuoteMarks(slots.body)}
            </FittedText>
            <figcaption className="kit-quote-speaker" {...speakerEnter}>
              <span className="kit-quote-name kit-type-lead">
                {smartPunctuation(frontmatter.name)}
              </span>
              {frontmatter.role === undefined ? null : (
                <span className="kit-quote-role kit-type-small">
                  {smartPunctuation(frontmatter.role)}
                </span>
              )}
            </figcaption>
          </figure>
        </Region>
      </div>
      {hasPortrait ? (
        <div className="kit-quote-portrait-cell" {...portraitEnter}>
          <Portrait
            className="kit-quote-portrait"
            name={frontmatter.name}
            photo={frontmatter.photo}
            focal={frontmatter.focal}
            treatment={frontmatter.treatment}
          />
        </div>
      ) : null}
    </Frame>
  );
}

/**
 * The `quote` layout's component.
 */
export const quoteLayout = defineLayout<typeof quoteLayoutContract>({
  name: 'quote',
  component: QuoteLayout,
});
