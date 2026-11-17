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
 * less padding). The roomy levels come before them (see {@link roomyLevels}).
 */
const CARD_LEVELS = [
  { text: 'body', title: 'title', grow: 'none', compact: false },
  { text: 'small', title: 'title', grow: 'none', compact: false },
  { text: 'small', title: 'title', grow: 'none', compact: true },
] as const;

/**
 * How a card is grown for the room: `large` and `roomy` stretch the cards to the region's height
 * with the icon on a larger tile at the top (the largest first) and the title and text standing on
 * the card's foot; `snug` stretches them the same way with the tile, title and spacing of the usual
 * size; `none` is the usual card, as tall as its content.
 */
type CardGrowth = 'large' | 'roomy' | 'snug' | 'none';

/**
 * One size of a row of cards.
 */
type CardLevel = {
  /**
   * The type step of the card text.
   */
  text: 'lead' | 'body' | 'small';

  /**
   * The type step of the card title: the headline size only at the largest levels of up to three
   * cards.
   */
  title: 'headline' | 'title';

  /**
   * How the cards are grown for the room.
   */
  grow: CardGrowth;

  /**
   * Whether the cards are compact: less padding, a smaller tile and title.
   */
  compact: boolean;
};

/**
 * The type step one above a card's text step, for the larger roomy levels; the lead size stays,
 * since a larger step would be a heading.
 *
 * @param text - The text step of the ladder's first level.
 */
function stepUp(text: 'lead' | 'body' | 'small'): 'lead' | 'body' {
  return text === 'small' ? 'body' : 'lead';
}

/**
 * The roomy levels for a ladder, tried before it, so a row never falls from its largest size
 * straight back to its usual one. Up to three cards first take the headline size for the title on
 * the largest tile, with the text a step above the ladder's first level and then at it; then the
 * title size on the roomy tile, the same two text sizes. Four cards, too narrow for a headline, try
 * the largest and the roomy tile with the text a step up, then the roomy tile at the first size.
 * Last comes a snug level, stretched like the others but with the usual tile and spacing, which a
 * row that fits its usual size with a little room over takes too. A level fits only when the
 * content leaves each card a gap between the icon and the title (the stylesheet holds it), so a row
 * that is already full skips them and renders as it would without them.
 *
 * @param levels - The ladder the row would take otherwise.
 * @param count - How many cards the row has.
 */
function roomyLevels(levels: readonly CardLevel[], count: number): CardLevel[] {
  const first = levels[0]?.text ?? 'body';
  const up = stepUp(first);
  const snug: CardLevel = { text: first, title: 'title', grow: 'snug', compact: false };
  if (count > BODY_TEXT_MOST_CARDS) {
    return [
      { text: up, title: 'title', grow: 'large', compact: false },
      { text: up, title: 'title', grow: 'roomy', compact: false },
      { text: first, title: 'title', grow: 'roomy', compact: false },
      snug,
    ];
  }

  return [
    { text: up, title: 'headline', grow: 'large', compact: false },
    { text: first, title: 'headline', grow: 'large', compact: false },
    { text: up, title: 'title', grow: 'roomy', compact: false },
    { text: first, title: 'title', grow: 'roomy', compact: false },
    snug,
  ];
}

/**
 * The height a row of cards needs. A roomy grid is as tall as its region, so its own box does not
 * tell; every card spans all of the grid's rows, so a card is as tall as the rows need, more than
 * the region when they do not fit. Usual cards are as tall as the grid. The heights are offset
 * heights, which ignore the transforms of a card's entrance and a step, so neither changes them.
 *
 * @param grid - The cards' grid.
 */
function cardsHeight(grid: HTMLElement): number {
  const cards = Array.from(grid.querySelectorAll<HTMLElement>('.kit-card'));
  return Math.max(0, ...cards.map((card) => card.offsetHeight));
}

/**
 * The `cards` layout: the shared header and an optional line of context, then the cards in one row
 * of equal columns, as tall as their content and placed a little above the middle of the space down
 * to the footnote. Each card is a panel in the surface's raised color: the icon on an accent tile,
 * the title directly under it and the text under that, on rows the cards share (a subgrid), so
 * icons, titles and text line up across the row whatever their length. Two or three cards set their
 * text at the body size when the row fits the region at that size, else at the small size; four
 * always at the small size; a row that still does not fit takes compact cards. Before all of these
 * the row tries its roomy levels, for content that leaves room ({@link roomyLevels}): the icon on a
 * larger tile at the top of the card and the title and text standing on its foot, the cards as tall
 * as the region or, with little in them, a little shorter and in its middle, from the largest
 * (headline titles, the text a type step up) down to a snug level barely larger than the usual
 * cards, so a few short cards fill the space with intent instead of floating in it and a row that
 * misses one level takes the next. A line of context and a footnote only take their room. The level
 * is chosen for the whole content, revealed or not, so it holds from the first step to the last.
 */
function CardsLayout({ frontmatter, slots }: LayoutProps<typeof cardsLayoutContract>): ReactNode {
  const isStatic = useStatic();
  const contextEnter = useEnter(1);
  const { brand } = useBrand();
  const { cards, reveal } = frontmatter;
  const region = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const ladder = cards.length <= BODY_TEXT_MOST_CARDS ? CARD_LEVELS : CARD_LEVELS.slice(1);
  const levels = [...roomyLevels(ladder, cards.length), ...ladder];
  // The key holds what changes the room as well as the cards, so a slide that loses its line of
  // context or its footnote while it is open tries the roomy levels again.
  const key = JSON.stringify([
    cards,
    frontmatter.title,
    slots.body === undefined,
    slots.footnote === undefined,
  ]);
  const { level } = useFitLevel(region, grid, levels.length, key, {
    height: cardsHeight,
    restartOnFontLoad: true,
  });
  const size: CardLevel = levels[level] ?? {
    text: 'small',
    title: 'title',
    grow: 'none',
    compact: true,
  };
  const textType = `kit-type-${size.text}`;
  const titleType = `kit-type-${size.title}`;
  const icons = cards.map((card) => frontmatterIcon(card.icon, brand.icons.set));
  return (
    <Frame
      layout="cards"
      variant={{
        'data-count': String(cards.length),
        'data-level': String(level),
        'data-roomy': String(size.grow !== 'none'),
        'data-large': String(size.grow === 'large'),
        'data-snug': String(size.grow === 'snug'),
        'data-compact': String(size.compact),
        'data-text': String(cards.some((card) => card.text !== undefined)),
        'data-icons': String(icons.some((icon) => icon !== undefined)),
      }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} />
      {slots.body === undefined ? null : (
        <div className="kit-cards-context kit-prose kit-body" {...contextEnter}>
          {slots.body}
        </div>
      )}
      <Region ref={region} className="kit-cards-region" place="optical">
        <div ref={grid} className="kit-cards">
          {cards.map((card, index) => {
            const Icon = icons[index];
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
                  <h3 className={`kit-card-title kit-heading ${titleType}`} data-fit="scaled">
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
