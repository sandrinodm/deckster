import { defineLayout, useStatic, type LayoutProps } from '@deckster/engine';
import { useRef, type CSSProperties, type ReactNode } from 'react';

import type { doDontLayoutContract } from '#layouts/do-dont-layout.contract.ts';

import { useFitLevel } from '#foundation/fit-level.ts';
import { KitMark } from '#foundation/marks.tsx';
import { Footnote, Frame, Region, SlideHeader } from '#foundation/slide-parts.tsx';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { enterProps, useEnter, type EnterProps } from '#motion/enter.ts';
import { Step } from '#motion/step.tsx';
import '#layouts/do-dont-layout.css';

/**
 * The first column's entrance order, after the header and context.
 */
const FIRST_COLUMN_ORDER = 2;

/**
 * The most examples per side that may use the title step for their text.
 */
const TITLE_TEXT_MAX_ITEMS = 3;

/**
 * The fit ladder grows sparse examples before stepping dense ones down.
 */
const LEVELS = [
  { text: 'title', heading: 'title', grow: true, compact: false },
  { text: 'lead', heading: 'title', grow: true, compact: false },
  { text: 'body', heading: 'title', grow: true, compact: false },
  { text: 'body', heading: 'title', grow: false, compact: false },
  { text: 'body', heading: 'title', grow: false, compact: true },
  { text: 'small', heading: 'lead', grow: false, compact: false },
  { text: 'small', heading: 'lead', grow: false, compact: true },
  { text: 'caption', heading: 'lead', grow: false, compact: true },
] as const;

/**
 * The shared grid's number of item rows, including empty rows on the shorter side.
 */
type ExamplesStyle = CSSProperties & { '--kit-do-dont-rows': number };

/**
 * Two lists with aligned headings and item rows. The fit level measures both complete lists even
 * before reveal, so neither column moves when the next step arrives.
 */
function DoDontLayout({ frontmatter, slots }: LayoutProps<typeof doDontLayoutContract>): ReactNode {
  const isStatic = useStatic();
  const contextEnter = useEnter(1);
  const region = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const count = Math.max(frontmatter.do.length, frontmatter.dont.length);
  const levels = LEVELS.filter((size) => size.text !== 'title' || count <= TITLE_TEXT_MAX_ITEMS);
  const key = JSON.stringify([frontmatter, slots.body === undefined, slots.footnote === undefined]);
  const { level } = useFitLevel(region, grid, levels.length, key, {
    height: examplesHeight,
    restartOnFontLoad: true,
  });
  const size = levels[level] ?? levels[levels.length - 1]!;
  const sides = [
    { label: frontmatter.labels.do, items: frontmatter.do, positive: true },
    { label: frontmatter.labels.dont, items: frontmatter.dont, positive: false },
  ];
  const style: ExamplesStyle = {
    '--kit-do-dont-rows': count,
  };
  return (
    <Frame
      layout="do-dont"
      variant={{
        'data-level': String(level),
        'data-grow': String(size.grow),
        'data-compact': String(size.compact),
      }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} maxLines={1} />
      {slots.body === undefined ? null : (
        <div className="kit-do-dont-context kit-prose kit-body" {...contextEnter}>
          {slots.body}
        </div>
      )}
      <Region ref={region} className="kit-do-dont-region" place="optical">
        <div ref={grid} className="kit-do-dont-grid" style={style}>
          {sides.map((side, index) => {
            const content = (
              <ExamplesColumn
                key={index}
                {...side}
                text={size.text}
                heading={size.heading}
                enter={enterProps(FIRST_COLUMN_ORDER + index, isStatic)}
              />
            );
            return frontmatter.reveal ? (
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
 * Measures spanning columns rather than the stretched grid, whose height is its region's.
 */
function examplesHeight(grid: HTMLElement): number {
  const columns = Array.from(grid.querySelectorAll<HTMLElement>('.kit-do-dont-column'));
  return Math.max(0, ...columns.map((column) => column.offsetHeight));
}

/**
 * A column's heading, examples, meaning, fitted type step and entrance.
 */
type ExamplesColumnProps = {
  /**
   * The column heading after applying its default.
   */
  label: string;

  /**
   * The examples in reading order; the contract accepts two to four.
   */
  items: readonly string[];

  /**
   * Whether these are actions to follow rather than avoid.
   */
  positive: boolean;

  /**
   * The shared fit ladder's text step for every example.
   */
  text: 'title' | 'lead' | 'body' | 'small' | 'caption';

  /**
   * The heading steps down with dense example text to preserve the hierarchy.
   */
  heading: 'title' | 'lead';

  /**
   * The entrance after the header and context; empty in static mode.
   */
  enter: EnterProps;
};

/**
 * One semantic section and list, using the kit's common judgement marks.
 */
function ExamplesColumn({
  label,
  items,
  positive,
  text,
  heading,
  enter,
}: ExamplesColumnProps): ReactNode {
  const mark = positive ? 'check' : 'cross';
  const role = positive ? 'positive' : 'negative';
  const defaultLabel = positive ? 'Do' : "Don't";
  const markAccessibility = label === defaultLabel ? {} : { label: `${defaultLabel}:` };
  return (
    <section className="kit-do-dont-column" data-role={role} {...enter}>
      <h3 className={`kit-do-dont-heading kit-heading kit-type-${heading}`}>
        <span className="kit-do-dont-heading-mark">
          <KitMark kind={mark} {...markAccessibility} />
        </span>
        <span>{smartPunctuation(label)}</span>
      </h3>
      <ul className="kit-do-dont-items">
        {items.map((item, index) => (
          <li key={index} className={`kit-do-dont-item kit-type-${text}`}>
            <span className="kit-do-dont-mark" aria-hidden="true" data-decorative="">
              <KitMark kind={mark} />
            </span>
            <span>{smartPunctuation(item)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The do-dont layout's runtime component.
 */
export const doDontLayout = defineLayout<typeof doDontLayoutContract>({
  name: 'do-dont',
  component: DoDontLayout,
});
