import type { ReactNode } from 'react';

import { defineLayout, useStatic, type LayoutProps } from '@deckster/engine';

import type { agendaLayoutContract } from '#layouts/agenda-layout.contract.ts';

import { Footnote, Frame, Region, SlideHeader } from '#foundation/slide-parts.tsx';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { enterProps } from '#motion/enter.ts';
import '#layouts/agenda-layout.css';

/**
 * The digits an item number is padded to: 2 becomes `02`.
 */
const NUMBER_DIGITS = 2;

/**
 * The item count from which the detail sits beside the title, in the small step.
 */
const DENSE_ITEMS = 5;

/**
 * The entrance order of the first item; the header comes before it.
 */
const FIRST_ITEM_ORDER = 1;

/**
 * Where an item stands against the part that starts now: done, now, to come, or `plain` on an
 * agenda without a current part.
 */
type ItemState = 'past' | 'current' | 'next' | 'plain';

/**
 * The `agenda` layout: the shared header, then the items as rows that share the height down to the
 * footnote, each under a rule: the number in the first column, the title with its detail under it
 * in the next nine and the time at the end. Five to seven rows set the detail beside the title
 * instead, on one line, and the titles a step smaller. With `current`, that row's rule and number
 * take the accent and the rows before it fade, so the same agenda shown between parts says where
 * the talk is.
 */
function AgendaLayout({ frontmatter, slots }: LayoutProps<typeof agendaLayoutContract>): ReactNode {
  const isStatic = useStatic();
  const { items, current } = frontmatter;
  const marked = current !== undefined && current <= items.length ? current : undefined;
  const dense = items.length >= DENSE_ITEMS;
  const detailType = dense ? 'kit-type-small' : 'kit-type-body';
  // A dense agenda sets its titles a step down from the title size, which `deck lint` reads as fit.
  const fitted = dense ? { 'data-fit': 'scaled' } : {};
  return (
    <Frame
      layout="agenda"
      variant={{
        'data-count': String(items.length),
        'data-current': String(marked !== undefined),
      }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} maxLines={1} />
      <Region className="kit-body">
        <ol className="kit-agenda">
          {items.map((item, index) => (
            <li
              key={index}
              className="kit-agenda-item kit-grid"
              data-state={stateOf(index + 1, marked)}
              aria-current={index + 1 === marked ? 'step' : undefined}
              {...enterProps(FIRST_ITEM_ORDER + index, isStatic)}>
              <span className="kit-agenda-number kit-type-title kit-numeric" {...fitted}>
                {String(index + 1).padStart(NUMBER_DIGITS, '0')}
              </span>
              <span className="kit-agenda-text">
                <span className="kit-agenda-title kit-type-title" {...fitted}>
                  {smartPunctuation(item.title)}
                </span>
                {item.detail === undefined ? null : (
                  <span className={`kit-agenda-detail ${detailType}`}>
                    {smartPunctuation(item.detail)}
                  </span>
                )}
              </span>
              {item.time === undefined ? null : (
                <span className="kit-agenda-time kit-type-small kit-numeric">
                  {smartPunctuation(item.time)}
                </span>
              )}
            </li>
          ))}
        </ol>
      </Region>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

/**
 * Where an item stands against the current part.
 *
 * @param number - The item's 1-based number.
 * @param current - The current part's number, if the slide marks one.
 */
function stateOf(number: number, current: number | undefined): ItemState {
  if (current === undefined) {
    return 'plain';
  }

  if (number === current) {
    return 'current';
  }

  return number < current ? 'past' : 'next';
}

/**
 * The `agenda` layout's component.
 */
export const agendaLayout = defineLayout<typeof agendaLayoutContract>({
  name: 'agenda',
  component: AgendaLayout,
});
