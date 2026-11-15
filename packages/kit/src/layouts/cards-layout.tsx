import { useBrand } from '@deckster/brand/runtime';
import { defineLayout, useStatic, type LayoutProps } from '@deckster/engine';
import { useRef, type ReactNode } from 'react';

import type { cardsLayoutContract } from '#layouts/cards-layout.contract.ts';

import { useFitLevel } from '#foundation/fit-level.ts';
import { frontmatterIcon } from '#foundation/frontmatter-assets.ts';
import { Footnote, Frame, Region, SlideHeader } from '#foundation/slide-parts.tsx';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { enterProps, useEnter } from '#motion/enter.ts';
import { Step } from '#motion/step.tsx';
import '#layouts/cards-layout.css';

/**
 * The entrance order of the first card; the header and context come before.
 */
const FIRST_CARD_ORDER = 2;

/**
 * The most cards whose text may be set at the body size; four to a row take the small size.
 */
const BODY_TEXT_MOST_CARDS = 3;

/**
 * The sizes a row of cards tries, largest first, until it fits its region: the text at the body
 * size, at the small size, then at the small size with compact cards (a smaller tile and title,
 * less padding).
 */
const CARD_LEVELS = [
  { text: 'body', compact: false },
  { text: 'small', compact: false },
  { text: 'small', compact: true },
] as const;

/**
 * The `cards` layout: the shared header and an optional line of context, then the cards in one row
 * of equal columns, as tall as their content and placed a little above the middle of the space down
 * to the footnote. Each card is a panel in the surface's raised color: the icon on an accent tile,
 * the title directly under it and the text under that, on rows the cards share (a subgrid), so
 * icons, titles and text line up across the row whatever their length. Two or three cards set their
 * text at the body size when the row fits the region at that size, else at the small size; four
 * always at the small size; a row that still does not fit takes compact cards.
 */
function CardsLayout({ frontmatter, slots }: LayoutProps<typeof cardsLayoutContract>): ReactNode {
  const isStatic = useStatic();
  const contextEnter = useEnter(1);
  const { brand } = useBrand();
  const { cards, reveal } = frontmatter;
  const region = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const levels = cards.length <= BODY_TEXT_MOST_CARDS ? CARD_LEVELS : CARD_LEVELS.slice(1);
  const { level } = useFitLevel(region, grid, levels.length, JSON.stringify(cards));
  const size = levels[level] ?? { text: 'small', compact: true };
  const textType = `kit-type-${size.text}`;
  return (
    <Frame
      layout="cards"
      variant={{ 'data-count': String(cards.length), 'data-compact': String(size.compact) }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} />
      {slots.body === undefined ? null : (
        <div className="kit-cards-context kit-prose kit-body" {...contextEnter}>
          {slots.body}
        </div>
      )}
      <Region ref={region} className="kit-cards-region" place="optical">
        <div ref={grid} className="kit-cards">
          {cards.map((card, index) => {
            const Icon = frontmatterIcon(card.icon, brand.icons.set);
            const content = (
              <article
                key={index}
                className="kit-card"
                data-icon={Icon !== undefined}
                {...enterProps(FIRST_CARD_ORDER + index, isStatic)}>
                {Icon === undefined ? null : (
                  <span className="kit-card-icon-tile" aria-hidden="true" data-decorative="">
                    <Icon className="kit-card-icon" aria-hidden="true" focusable="false" />
                  </span>
                )}
                <div className="kit-card-text">
                  <h3 className="kit-card-title kit-heading kit-type-title" data-fit="scaled">
                    {smartPunctuation(card.title)}
                  </h3>
                  {card.text === undefined ? null : (
                    <p className={`kit-card-body ${textType}`}>{smartPunctuation(card.text)}</p>
                  )}
                </div>
              </article>
            );
            return reveal ? (
              <Step key={index} at={index + 1}>
                {content}
              </Step>
            ) : (
              content
            );
          })}
        </div>
      </Region>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

/**
 * The `cards` layout's component.
 */
export const cardsLayout = defineLayout<typeof cardsLayoutContract>({
  name: 'cards',
  component: CardsLayout,
});
