import type { CSSProperties, ReactNode } from 'react';

import { defineLayout, useStatic, type LayoutProps } from '@deckster/engine';
import { Fragment } from 'react';

import type {
  comparisonLayoutContract,
  ComparisonOptionEntry,
  ComparisonRowEntry,
} from '#layouts/comparison-layout.contract.ts';

import { Footnote, Frame, Region, SlideHeader } from '#foundation/slide-parts.tsx';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { enterProps, type EnterProps } from '#motion/enter.ts';
import { Step } from '#motion/step.tsx';
import '#layouts/comparison-layout.css';

/**
 * The entrance order of the first option's column; the header and the labels come before.
 */
const FIRST_OPTION_ORDER = 2;

/**
 * The entrance order of the row labels, before every option's column.
 */
const LABEL_ORDER = 1;

/**
 * How the options' parts come in: one per step when the slide reveals them, and each entering with
 * its column when the slide animates.
 */
type ColumnMotion = {
  /**
   * Whether the slide reveals one option per step.
   */
  reveal: boolean;

  /**
   * Whether the deck is rendering a static picture, which has no entrance animation.
   */
  isStatic: boolean;
};

/**
 * The `comparison` layout: the shared header, then one grid across the twelve columns: the row
 * labels in the first column, each option in an equal column after it (three each of four columns
 * with three options, four each of three with two). The options' names and summaries head their
 * columns over a rule, under a badge row every column reserves when one option is recommended, so
 * the names stand level; each row is a hairline-ruled line across the grid. The recommended
 * option's column sits on a panel in the surface's raised color with an accent rule over its name.
 * A row that names its `winner` sets that cell bold in the positive text color, with a diamond. The
 * grid is a table to assistive technology: rows of a row header and one cell per option, in reading
 * order, placed on the grid by row and column.
 */
function ComparisonLayout({
  frontmatter,
  slots,
}: LayoutProps<typeof comparisonLayoutContract>): ReactNode {
  const isStatic = useStatic();
  const { options, rows, reveal } = frontmatter;
  const motion: ColumnMotion = { reveal, isStatic };
  const hasBadge = options.some((option) => option.recommended === true);
  // Custom properties are not in CSSProperties, so the object is typed by the cast.
  const style = {
    '--kit-option-count': options.length,
    '--kit-row-count': rows.length,
  } as CSSProperties;
  return (
    <Frame
      layout="comparison"
      variant={{
        'data-count': String(options.length),
        'data-rows': String(rows.length),
        'data-badge': String(hasBadge),
      }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} maxLines={1} />
      <Region className="kit-body" place="optical">
        <div
          className="kit-comparison-grid"
          role="table"
          aria-label={frontmatter.title}
          style={style}>
          {renderPanels(options, motion)}
          <div className="kit-comparison-row" role="row">
            {renderHeads(options, frontmatter.badge, hasBadge, motion)}
          </div>
          {renderRows(rows, options, motion)}
        </div>
      </Region>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

/**
 * The panel behind the recommended option's column, if any: it spans the column's rows.
 *
 * @param options - The options, in column order.
 * @param motion - How the columns enter.
 */
function renderPanels(
  options: readonly ComparisonOptionEntry[],
  motion: ColumnMotion,
): ReactNode[] {
  return options.map((option, column) =>
    option.recommended === true
      ? inColumn(
          motion,
          column,
          `panel-${column}`,
          <span
            className="kit-comparison-panel"
            aria-hidden="true"
            data-decorative=""
            style={{ gridColumn: column + 2 }}
            {...columnEnter(motion, column)}
          />,
        )
      : null,
  );
}

/**
 * The header of each option's column: its badge, name and summary.
 *
 * @param options - The options, in column order.
 * @param badge - The word over the recommended option.
 * @param hasBadge - Whether one option is recommended, so every column reserves the badge row.
 * @param motion - How the columns enter.
 */
function renderHeads(
  options: readonly ComparisonOptionEntry[],
  badge: string,
  hasBadge: boolean,
  motion: ColumnMotion,
): ReactNode[] {
  return options.map((option, column) =>
    inColumn(
      motion,
      column,
      `head-${column}`,
      <div
        className="kit-comparison-head"
        role="columnheader"
        data-recommended={option.recommended === true}
        style={{ gridColumn: column + 2 }}
        {...columnEnter(motion, column)}>
        {hasBadge ? (
          <span className="kit-comparison-badge kit-type-label">{badgeOf(option, badge)}</span>
        ) : null}
        <h3 className="kit-comparison-name kit-heading kit-type-title" data-fit="scaled">
          {smartPunctuation(option.name)}
        </h3>
        {option.summary === undefined ? null : (
          <p className="kit-comparison-summary kit-type-small">
            {smartPunctuation(option.summary)}
          </p>
        )}
      </div>,
    ),
  );
}

/**
 * The rows of the grid: each row's label, then one value per option.
 *
 * @param rows - The rows, top to bottom.
 * @param options - The options, in column order.
 * @param motion - How the columns enter.
 */
function renderRows(
  rows: readonly ComparisonRowEntry[],
  options: readonly ComparisonOptionEntry[],
  motion: ColumnMotion,
): ReactNode[] {
  return rows.map((row, index) => (
    <div key={index} className="kit-comparison-row" role="row">
      <span
        className="kit-comparison-label kit-type-body"
        role="rowheader"
        data-fit="scaled"
        style={{ gridRow: index + 2 }}
        {...enterProps(LABEL_ORDER, motion.isStatic)}>
        {smartPunctuation(row.label)}
      </span>
      {options.map((option, column) =>
        inColumn(
          motion,
          column,
          `cell-${index}-${column}`,
          <span
            className="kit-comparison-value kit-type-body"
            role="cell"
            data-fit="scaled"
            data-recommended={option.recommended === true}
            data-last={index === rows.length - 1}
            data-winner={row.winner === column + 1}
            style={{ gridRow: index + 2, gridColumn: column + 2 }}
            {...columnEnter(motion, column)}>
            {row.winner === column + 1 ? <WinnerMark /> : null}
            <Value row={row} column={column} />
          </span>,
        ),
      )}
    </div>
  ));
}

/**
 * The word over an option in the badge row: the slide's badge over the recommended option, nothing
 * over the others.
 *
 * @param option - The option.
 * @param badge - The slide's badge.
 */
function badgeOf(option: ComparisonOptionEntry, badge: string): string {
  return option.recommended === true ? smartPunctuation(badge) : '';
}

/**
 * Wraps an option's part so it appears on its own step when the slide reveals its options.
 *
 * @param motion - How the columns enter.
 * @param column - The option's index.
 * @param key - The React key of the step.
 * @param part - The option's element.
 */
function inColumn(motion: ColumnMotion, column: number, key: string, part: ReactNode): ReactNode {
  if (!motion.reveal) {
    // The part is one of a list either way, so it takes the same key without a step around it.
    return <Fragment key={key}>{part}</Fragment>;
  }

  return (
    <Step key={key} at={column + 1}>
      {part}
    </Step>
  );
}

/**
 * The entrance of an option's column, in the order after the header and the labels.
 *
 * @param motion - How the columns enter.
 * @param column - The option's index.
 */
function columnEnter(motion: ColumnMotion, column: number): EnterProps {
  return enterProps(FIRST_OPTION_ORDER + column, motion.isStatic);
}

/**
 * Props of {@link Value}.
 */
type ValueProps = {
  /**
   * The row.
   */
  row: ComparisonRowEntry;

  /**
   * The option's index.
   */
  column: number;
};

/**
 * The mark on the cell that wins its row: a small diamond in the gutter before the value, named for
 * assistive technology (so the win does not rest on the bold weight and the color alone) and left
 * out of `deckster lint`'s overflow measure, which would count a mark hung outside the cell's box.
 */
function WinnerMark(): ReactNode {
  return (
    <svg
      className="kit-comparison-winner"
      viewBox="0 0 24 24"
      data-mark="winner"
      data-decorative="">
      <title>Best in this row</title>
      <path d="M12 2l10 10-10 10L2 12z" />
    </svg>
  );
}

/**
 * One option's value in a row: its text, a check for `true`, a dash for `false` or a missing value.
 */
function Value({ row, column }: ValueProps): ReactNode {
  const value = row.values[column];
  if (value === true) {
    return (
      <svg className="kit-comparison-mark" viewBox="0 0 24 24" data-mark="yes">
        <title>Yes</title>
        <circle cx="12" cy="12" r="11" />
        <path d="M6.5 12.5l3.8 3.8L17.5 8.5" />
      </svg>
    );
  }

  if (value === false || value === undefined) {
    return (
      <svg className="kit-comparison-mark" viewBox="0 0 24 24" data-mark="no">
        <title>No</title>
        <path d="M6.5 12h11" />
      </svg>
    );
  }

  return smartPunctuation(value);
}

/**
 * The `comparison` layout's component.
 */
export const comparisonLayout = defineLayout<typeof comparisonLayoutContract>({
  name: 'comparison',
  component: ComparisonLayout,
});
