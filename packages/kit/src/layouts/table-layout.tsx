import { MIN_TYPE_SIZE_PX } from '@deckster/brand';
import { useBrand } from '@deckster/brand/runtime';
import { defineLayout, type LayoutProps } from '@deckster/engine';
import { useMemo, useRef, type CSSProperties, type ReactNode } from 'react';

import type { tableLayoutContract } from '#layouts/table-layout.contract.ts';

import {
  Footnote,
  Frame,
  Region,
  SlideHeader,
  TableLayoutContext,
  useEnter,
  useFitLevel,
  type TableLayoutSettings,
} from '#layout-parts.ts';
import '#layouts/table-layout.css';

/**
 * The sizes a table tries in the brand's table step, largest first, until it fits its region; none
 * goes below the brand's smallest type.
 */
const TABLE_FIT_STEPS: readonly number[] = [1, 0.92, 0.85, 0.78, 0.72];

/**
 * The step a sparse table is set in when it fits: running text's size, so a short table does not
 * sit small in a large region.
 */
const SPARSE_TABLE_STEP = 'body';

/**
 * How much of the region a table set in the larger step may fill.
 */
const SPARSE_FILL = 0.85;

/**
 * The rounding slack, in pixels, allowed when a fitted size is compared with the brand's smallest
 * type, so a size that is exactly the minimum after rounding still counts.
 */
const TYPE_SIZE_TOLERANCE_PX = 0.01;

/**
 * One size a table can be set at: a brand type step and a fit factor on it.
 */
type TableSize = {
  /**
   * The brand type step of the cells.
   */
  step: string;

  /**
   * The factor on the step's size, and on the header's label size.
   */
  fit: number;
};

/**
 * The `table` layout: the shared header, then the table across the twelve columns, or eight beside
 * the aside, a little above the middle of the space down to the footnote. A Markdown table and a
 * kit `<Table>` are set alike: the layout picks the size (the body size for a sparse table, else
 * the brand's table step, stepping down until the table fits but never below the brand's smallest
 * type) and both tables take it from their column; both mark the row or column `highlight:` names
 * as the brand's charts do, the Markdown one through the kit's `table` component and the `<Table>`
 * through its own highlight, which the slide's fills when the table names none. A table that still
 * does not fit is marked for `deckster lint`.
 */
function TableLayout({ frontmatter, slots }: LayoutProps<typeof tableLayoutContract>): ReactNode {
  const { brand } = useBrand();
  const hasAside = slots.aside !== undefined;
  const bodyEnter = useEnter(1);
  const asideEnter = useEnter(2);
  const region = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const tableStep = brand.charts.table.body;
  const sizes = useMemo(() => tableSizes(brand, tableStep), [brand, tableStep]);
  const grows = sizes[0]?.step !== tableStep;
  const { level, overflows } = useFitLevel(
    region,
    content,
    sizes.length,
    JSON.stringify(frontmatter),
    { fill: (at) => (grows && at === 0 ? SPARSE_FILL : 1) },
  );
  const size = sizes[level] ?? { step: tableStep, fit: 1 };
  const settings: TableLayoutSettings = useMemo(
    () => ({
      highlight: frontmatter.highlight,
      emphasis: brand.charts.table.emphasis,
      alignNumbers: frontmatter.numbers === 'right',
    }),
    [frontmatter.highlight, frontmatter.numbers, brand.charts.table.emphasis],
  );
  const fitState = fitStateOf(overflows, grows && level === 0, size.fit);
  const style = { '--kit-fit': size.fit, '--kit-table-fit': size.fit } as CSSProperties;
  return (
    <Frame layout="table" variant={{ 'data-aside': String(hasAside) }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} />
      <Region ref={region} className="kit-body" place="optical">
        <div ref={content} className="kit-table-layout kit-grid">
          <div
            className={`kit-table-main kit-type-${size.step}`}
            style={style}
            data-kit-table-fit={fitState}
            data-fit={fitState === 'stepped' || fitState === 'overflow' ? 'scaled' : undefined}
            {...bodyEnter}>
            <TableLayoutContext value={settings}>{slots.body}</TableLayoutContext>
          </div>
          {hasAside ? (
            <aside className="kit-table-aside kit-prose" data-text="body" {...asideEnter}>
              {slots.aside}
            </aside>
          ) : null}
        </div>
      </Region>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

/**
 * The sizes a table tries, largest first: the body step when the brand's table step is smaller,
 * then the table step at each fit step whose cells and header stay at or above the brand's smallest
 * type.
 *
 * @param brand - The brand's tokens.
 * @param tableStep - The brand's table step.
 */
function tableSizes(brand: ReturnType<typeof useBrand>['brand'], tableStep: string): TableSize[] {
  const scale: Readonly<Record<string, { size: number } | undefined>> = brand.typography.scale;
  const cell = scale[tableStep]?.size ?? MIN_TYPE_SIZE_PX;
  const header = scale['label']?.size ?? cell;
  const smallest = Math.min(cell, header);
  const steps = TABLE_FIT_STEPS.filter(
    (fit) => fit * smallest >= MIN_TYPE_SIZE_PX - TYPE_SIZE_TOLERANCE_PX,
  );
  const fitted = (steps.length === 0 ? [1] : steps).map((fit) => ({ step: tableStep, fit }));
  return tableStep === SPARSE_TABLE_STEP
    ? fitted
    : [{ step: SPARSE_TABLE_STEP, fit: 1 }, ...fitted];
}

/**
 * How the table was fitted, for `deckster lint` and tests: grown to the body size, at its natural
 * size, stepped down, or overflowing even at the smallest.
 *
 * @param overflows - Whether it overflows at the last size.
 * @param grown - Whether it is set at the larger, sparse size.
 * @param fit - The fit factor.
 */
function fitStateOf(
  overflows: boolean,
  grown: boolean,
  fit: number,
): 'grown' | 'natural' | 'stepped' | 'overflow' {
  if (overflows) {
    return 'overflow';
  }

  if (grown) {
    return 'grown';
  }

  return fit === 1 ? 'natural' : 'stepped';
}

/**
 * The `table` layout's component.
 */
export const tableLayout = defineLayout<typeof tableLayoutContract>({
  name: 'table',
  component: TableLayout,
});
