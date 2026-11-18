import { useBrand } from '@deckster/brand/runtime';
import { defineLayout, useStatic, type LayoutProps } from '@deckster/engine';
import {
  Children,
  cloneElement,
  Fragment,
  isValidElement,
  useId,
  useRef,
  type ReactNode,
} from 'react';

import type { dashboardLayoutContract } from '#layouts/dashboard-layout.contract.ts';

import { useFitLevel } from '#foundation/fit-level.ts';
import { useFitGroupWidth } from '#foundation/fit-text.ts';
import { Footnote, Frame, Region, SlideHeader } from '#foundation/slide-parts.tsx';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { enterProps } from '#motion/enter.ts';
import { Step } from '#motion/step.tsx';
import '#layouts/dashboard-layout.css';

/**
 * Panel entrances follow the header.
 */
const FIRST_PANEL_ORDER = 2;

/**
 * Headings retain the title face while yielding room to the plots.
 */
const PANEL_LEVEL_COUNT = 3;

/**
 * Four body lines leave space for chart marks after axes and labels.
 */
const MIN_PLOT_BODY_LINES = 4;

/**
 * Measures the full grid plus any room its shortest panel plot still needs.
 */
function dashboardHeight(content: HTMLElement): number {
  const style = getComputedStyle(content);
  const bodySize = Number.parseFloat(style.getPropertyValue('--brand-type-body-size'));
  const bodyLeading = Number.parseFloat(style.getPropertyValue('--brand-type-body-line-height'));
  const minimum = MIN_PLOT_BODY_LINES * bodySize * bodyLeading;
  const plots = Array.from(content.querySelectorAll<HTMLElement>('.kit-dashboard-plot'));
  const shortest = Math.min(...plots.map((plot) => plot.clientHeight));
  return content.scrollHeight + Math.max(0, minimum - shortest);
}

/**
 * Builds a fit identity without descending into React elements or their circular dev owners.
 * Functions are omitted; nested elements stand for content rather than renderer internals.
 *
 * @param values - Everything that changes the content or its available room.
 * @returns A JSON key safe for nested React content.
 */
export function dashboardFitKey(values: readonly unknown[]): string {
  return JSON.stringify(values, (_key, value: unknown) => {
    if (isValidElement(value)) {
      return '<element>';
    }

    return typeof value === 'function' ? undefined : value;
  });
}

/**
 * Checks the one-to-one pairing before rendering a grid.
 *
 * @param headings - The number of frontmatter panel headings.
 * @param components - The number of direct body components.
 * @throws When the counts differ, with an author-facing correction.
 */
export function validateDashboardCount(headings: number, components: number): void {
  if (headings !== components) {
    throw new Error(
      `Dashboard has ${headings} panel headings but ${components} body components. ` +
        'Write one direct chart or number component per panel, in heading order.',
    );
  }
}

/**
 * The dashboard's equal panels. The original measurable body slot wraps the assembled grid, so lint
 * and export still find the body after the components have been paired with their headings.
 */
function DashboardLayout({
  frontmatter,
  slots,
}: LayoutProps<typeof dashboardLayoutContract>): ReactNode {
  const { panels, reveal } = frontmatter;
  const { surface } = useBrand();
  const isStatic = useStatic();
  const id = useId();
  const region = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const charts = dashboardCharts(slots.body);
  validateDashboardCount(panels.length, charts.length);
  const chartProps = charts.map((chart) => (isValidElement(chart) ? chart.props : chart));
  const key = dashboardFitKey([
    panels,
    chartProps,
    frontmatter.title,
    slots.footnote === undefined,
  ]);
  useFitGroupWidth(grid, '.kit-dashboard-plot .kit-stat-value');
  const { level } = useFitLevel(region, grid, PANEL_LEVEL_COUNT, key, {
    height: dashboardHeight,
    restartOnFontLoad: true,
  });
  const content = (
    <div ref={grid} className="kit-dashboard-grid">
      {panels.map((panel, index) => {
        const headingId = `${id}-panel-${index}`;
        const plot = <div className="kit-dashboard-plot">{charts[index]}</div>;
        return (
          <section
            key={index}
            className="kit-dashboard-panel"
            data-plate={surface.name === 'accent' ? 'visible' : undefined}
            aria-labelledby={headingId}>
            <h3
              id={headingId}
              className={`kit-dashboard-heading kit-heading kit-type-${panels.length === 4 ? 'lead' : 'title'}`}
              data-fit="scaled">
              {smartPunctuation(panel.title)}
            </h3>
            <div
              className="kit-dashboard-content"
              {...enterProps(FIRST_PANEL_ORDER + index, isStatic)}>
              {reveal ? <Step at={index + 1}>{plot}</Step> : plot}
            </div>
          </section>
        );
      })}
    </div>
  );
  return (
    <Frame
      layout="dashboard"
      variant={{ 'data-count': String(panels.length), 'data-level': String(level) }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} maxLines={1} />
      <Region ref={region} className="kit-dashboard-region">
        {isValidElement<{ children?: ReactNode }>(slots.body)
          ? cloneElement(slots.body, {}, content)
          : content}
      </Region>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

/**
 * Reads direct body components through the engine's measurable slot and transparent fragments.
 * Whitespace between MDX elements does not make a panel; actual content is never dropped.
 *
 * @param body - The wrapped body slot, or a fragment or array in a layout invocation.
 * @returns The components in source order.
 */
export function dashboardCharts(body: ReactNode): ReactNode[] {
  return Children.toArray(body).flatMap((child) => {
    if (typeof child === 'string' && child.trim() === '') {
      return [];
    }

    if (
      isValidElement<{ children?: ReactNode; 'data-slot'?: string }>(child) &&
      (child.type === Fragment || child.props['data-slot'] === 'body')
    ) {
      return dashboardCharts(child.props.children);
    }

    return [child];
  });
}

/**
 * The dashboard layout's runtime component.
 */
export const dashboardLayout = defineLayout<typeof dashboardLayoutContract>({
  name: 'dashboard',
  component: DashboardLayout,
});
