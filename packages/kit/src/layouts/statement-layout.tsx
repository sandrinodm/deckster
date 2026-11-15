import type { ReactNode } from 'react';

import { defineLayout, type LayoutProps } from '@deckster/engine';

import type { FitRung } from '#foundation/fit-text.ts';
import type { statementLayoutContract } from '#layouts/statement-layout.contract.ts';

import { Eyebrow, FittedText, Frame, Region } from '#foundation/slide-parts.tsx';
import { useEnter } from '#motion/enter.ts';
import '#layouts/statement-layout.css';

/**
 * The sizes a plain statement tries: the display style while it takes three lines at most, then the
 * headline style (the brand's quote size, upright) in up to four lines, stepping down.
 */
const STATEMENT_LADDER: readonly FitRung[] = [
  { scale: 1, maxLines: 3 },
  { scale: 0.88, maxLines: 3 },
  { step: 'headline', scale: 1, maxLines: 4 },
  { step: 'headline', scale: 0.88, maxLines: 4 },
  { step: 'headline', scale: 0.78, maxLines: 4 },
  { step: 'headline', scale: 0.7, maxLines: 4 },
];

/**
 * The sizes a quote tries: the brand's quote style in up to four lines, stepping down.
 */
const QUOTE_LADDER: readonly FitRung[] = [
  { scale: 1, maxLines: 4 },
  { scale: 0.88, maxLines: 4 },
  { scale: 0.78, maxLines: 4 },
  { scale: 0.7, maxLines: 4 },
];

/**
 * The `statement` layout: the eyebrow on the top line and the statement composed in the space below
 * it, a little above the middle. A plain statement is set in the display style across eleven
 * columns while it takes three lines, else at the headline (quote) size in ten columns and at most
 * four lines; with an attribution it becomes a quote in the brand's quote style across ten columns,
 * with hanging marks and the speaker below in the lead style.
 */
function StatementLayout({
  frontmatter,
  slots,
}: LayoutProps<typeof statementLayoutContract>): ReactNode {
  const isQuote = slots.attribution !== undefined;
  const textEnter = useEnter(0);
  const attributionEnter = useEnter(2);
  const typeClass = isQuote ? 'kit-type-quote' : 'kit-type-display';
  return (
    <Frame layout="statement" variant={{ 'data-quote': String(isQuote) }}>
      <Eyebrow text={frontmatter.eyebrow} reserve />
      <Region className="kit-statement-region" place="optical">
        <figure className="kit-statement" {...textEnter}>
          <FittedText
            as={isQuote ? 'blockquote' : 'div'}
            className={`kit-statement-text kit-heading ${typeClass}`}
            ladder={isQuote ? QUOTE_LADDER : STATEMENT_LADDER}
            boundary=".kit-region">
            {slots.body}
          </FittedText>
          {isQuote ? (
            <figcaption className="kit-statement-attribution kit-type-lead" {...attributionEnter}>
              {slots.attribution}
            </figcaption>
          ) : null}
        </figure>
      </Region>
    </Frame>
  );
}

/**
 * The `statement` layout's component.
 */
export const statementLayout = defineLayout<typeof statementLayoutContract>({
  name: 'statement',
  component: StatementLayout,
});
