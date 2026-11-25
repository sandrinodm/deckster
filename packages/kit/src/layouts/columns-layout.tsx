import { useBrand } from '@deckster/brand/runtime';
import { defineLayout, useStatic, type LayoutProps } from '@deckster/engine';
import { useRef, type CSSProperties, type ReactNode } from 'react';

import type { ColumnEntry, columnsLayoutContract } from '#layouts/columns-layout.contract.ts';

import {
  enterProps,
  Footnote,
  Frame,
  Region,
  SlideHeader,
  smartPunctuation,
  Step,
  useFitLevel,
} from '#layout-parts.ts';
import '#layouts/columns-layout.css';

/**
 * The entrance order of the first column; the header comes before.
 */
const FIRST_COLUMN_ORDER = 2;

/**
 * The most columns whose items may be set at the body size; four to a row take the small size.
 */
const BODY_TEXT_MOST_COLUMNS = 3;

/**
 * The sizes the board tries, largest first, until it fits its region: the items at the body size,
 * at the small size, then at the small size in compact columns (less padding, smaller headings),
 * and last at the caption size in compact columns, for a full board under a long title.
 */
const COLUMN_LEVELS = [
  { text: 'body', compact: false },
  { text: 'small', compact: false },
  { text: 'small', compact: true },
  { text: 'caption', compact: true },
] as const;

/**
 * The surface that lights the current column, unless the slide is on it already.
 */
const ACCENT_SURFACE = 'accent';

/**
 * The custom properties the stylesheet builds the board's grid from.
 */
type BoardStyle = CSSProperties & {
  /**
   * How many columns the board has.
   */
  '--kit-board-columns': number;

  /**
   * How many item rows the longest column takes.
   */
  '--kit-board-rows': number;
};

/**
 * The `columns` layout: the shared header, then a board of two to four equal columns down to the
 * bottom line (or to the footnote). Each column is a panel in the surface's raised color with a
 * head (its tag and its count of items on one line, its heading under them, a rule under that) and
 * its items under the head, one per row. The heads and the items of every column share the rows of
 * one grid (a subgrid), so headings end level and the n-th items of every column start level,
 * however long the text before them; a shorter column leaves its last rows empty and its panel
 * still runs to the foot of the board. The `current` column sits on the accent surface, or on the
 * inverse surface when the slide itself is on the accent surface, so it stays lit. Two or three
 * columns set their items at the body size when the board fits at that size, four at the small
 * size; a board that still does not fit takes compact columns, and last the caption size.
 */
function ColumnsLayout({
  frontmatter,
  slots,
}: LayoutProps<typeof columnsLayoutContract>): ReactNode {
  const isStatic = useStatic();
  const { columns, current, reveal } = frontmatter;
  const { surface } = useBrand();
  const lit = surface.name === ACCENT_SURFACE ? 'inverse' : ACCENT_SURFACE;
  const region = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const levels = columns.length <= BODY_TEXT_MOST_COLUMNS ? COLUMN_LEVELS : COLUMN_LEVELS.slice(1);
  const { level } = useFitLevel(region, board, levels.length, JSON.stringify(columns), {
    overflow: true,
    restartOnFontLoad: true,
  });
  const size = levels[level] ?? { text: 'caption', compact: true };
  const style: BoardStyle = {
    '--kit-board-columns': columns.length,
    '--kit-board-rows': Math.max(...columns.map((column) => column.items.length)),
  };
  return (
    <Frame
      layout="columns"
      variant={{ 'data-count': String(columns.length), 'data-compact': String(size.compact) }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} />
      <Region ref={region} className="kit-columns-region">
        <div ref={board} className="kit-columns" style={style}>
          {columns.map((column, index) => {
            const content = (
              <Lane
                key={index}
                column={column}
                lit={current === index + 1 ? lit : undefined}
                itemType={`kit-type-${size.text}`}
                enter={enterProps(FIRST_COLUMN_ORDER + index, isStatic)}
              />
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
 * Props of {@link Lane}.
 */
type LaneProps = {
  /**
   * The column from the frontmatter.
   */
  column: ColumnEntry;

  /**
   * The surface of the column that matters now; nothing for the others, which stay quiet.
   */
  lit: string | undefined;

  /**
   * The type class of the items, from the board's fit level.
   */
  itemType: string;

  /**
   * The column's place in the slide entrance.
   */
  enter: ReturnType<typeof enterProps>;
};

/**
 * One column of the board: its head and its items, each on its own row of the board's grid.
 */
function Lane({ column, lit, itemType, enter }: LaneProps): ReactNode {
  const current = lit !== undefined;
  const surface = current ? { 'data-surface': lit } : {};
  const count = String(column.items.length).padStart(2, '0');
  return (
    <section
      className="kit-lane"
      data-current={String(current)}
      aria-current={current ? 'true' : undefined}
      {...surface}
      {...enter}>
      <p className="kit-lane-meta kit-type-label">
        <span className="kit-lane-note">
          {column.note === undefined ? null : (
            <span className="kit-lane-chip">{smartPunctuation(column.note)}</span>
          )}
        </span>
        <span
          className="kit-lane-count kit-numeric kit-type-small"
          aria-label={`${column.items.length} items`}>
          {count}
        </span>
      </p>
      <h3 className="kit-lane-title kit-heading kit-type-title" data-fit="scaled">
        {smartPunctuation(column.title)}
      </h3>
      <ul className="kit-lane-items">
        {column.items.map((item, index) => (
          <li key={index} className={`kit-lane-item ${itemType}`}>
            {smartPunctuation(item)}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The `columns` layout's component.
 */
export const columnsLayout = defineLayout<typeof columnsLayoutContract>({
  name: 'columns',
  component: ColumnsLayout,
});
