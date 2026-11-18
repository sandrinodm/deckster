import { defineLayout, useStatic, type LayoutProps } from '@deckster/engine';
import { useRef, type CSSProperties, type ReactNode } from 'react';

import type { scheduleLayoutContract } from '#layouts/schedule-layout.contract.ts';

import { useFitLevel } from '#foundation/fit-level.ts';
import { Footnote, Frame, Region, SlideHeader } from '#foundation/slide-parts.tsx';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { enterProps, useEnter } from '#motion/enter.ts';
import { Step } from '#motion/step.tsx';
import '#layouts/schedule-layout.css';

/**
 * The type and spacing ladder, largest first; short schedules carry larger lane names and bars.
 */
const SCHEDULE_LEVELS = ['roomy', 'snug', 'body', 'small', 'tight', 'dense', 'compact'] as const;

/**
 * The entrance order of the first lane, after the header and context.
 */
const FIRST_LANE_ORDER = 2;

/**
 * A Gantt with aligned lane names, optional labels above each bar and a shared period grid. Bar
 * labels stay outside durations so a one-period bar remains readable on an eight-period axis. The
 * fit level is measured with every lane present, including unrevealed lanes.
 */
function ScheduleLayout({
  frontmatter,
  slots,
}: LayoutProps<typeof scheduleLayoutContract>): ReactNode {
  const { periods, lanes, current, now, reveal } = frontmatter;
  const isStatic = useStatic();
  const contextEnter = useEnter(1);
  const region = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const key = JSON.stringify([frontmatter, slots.body === undefined, slots.footnote === undefined]);
  const { level } = useFitLevel(region, grid, SCHEDULE_LEVELS.length, key, {
    height: scheduleHeight,
    restartOnFontLoad: true,
  });
  const size = SCHEDULE_LEVELS[level] ?? 'compact';
  const style: CSSProperties & Record<`--${string}`, number> = {
    '--kit-schedule-periods': periods.length,
    '--kit-schedule-now': now ?? 1,
  };
  const nameType = size === 'roomy' ? 'title' : 'body';
  const labelType = size === 'roomy' || size === 'snug' ? 'small' : 'caption';
  const periodType = 'label';
  return (
    <Frame
      layout="schedule"
      variant={{
        'data-count': String(lanes.length),
        'data-level': size,
        'data-periods': String(periods.length),
      }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} maxLines={1} />
      {slots.body === undefined ? null : (
        <div className="kit-schedule-context kit-prose kit-body" {...contextEnter}>
          {slots.body}
        </div>
      )}
      <Region ref={region} className="kit-schedule-region" place="optical">
        <div ref={grid} className="kit-schedule" style={style}>
          <div className="kit-schedule-axis">
            {periods.map((period, index) => (
              <div
                key={index}
                className={`kit-schedule-period kit-type-${periodType}`}
                aria-current={now === index + 1 ? 'date' : undefined}>
                {smartPunctuation(period)}
                {now === index + 1 ? (
                  <span className="kit-schedule-sr-only" data-decorative="">
                    {' '}
                    (now)
                  </span>
                ) : null}
              </div>
            ))}
            {now === undefined ? null : (
              <span className="kit-schedule-now kit-type-label" aria-hidden="true">
                Now
              </span>
            )}
          </div>
          <div className="kit-schedule-lanes">
            <div className="kit-schedule-columns" aria-hidden="true" data-decorative="">
              {periods.map((_, index) => (
                <span key={index} />
              ))}
            </div>
            {lanes.map((lane, index) => {
              const content = (
                <section
                  key={index}
                  className="kit-schedule-lane"
                  aria-current={current === index + 1 ? 'true' : undefined}
                  {...enterProps(FIRST_LANE_ORDER + index, isStatic)}>
                  <h3
                    className={`kit-schedule-name kit-heading kit-type-${nameType}`}
                    style={{ gridRow: `1 / span ${lane.bars.length}` }}>
                    {current === index + 1 ? (
                      <svg
                        className="kit-schedule-arrow"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        focusable="false"
                        data-decorative="">
                        <path d="M4 12h16m-6-6 6 6-6 6" />
                      </svg>
                    ) : null}
                    {smartPunctuation(lane.name)}
                  </h3>
                  {lane.bars.map((bar, barIndex) => (
                    <figure
                      key={barIndex}
                      className="kit-schedule-track"
                      style={{ gridRow: barIndex + 1 }}
                      aria-label={`${bar.label ?? lane.name}: ${periods[bar.from - 1]} through ${periods[bar.to - 1]}`}>
                      {bar.label === undefined ? null : (
                        <span
                          className={`kit-schedule-label kit-type-${labelType}`}
                          style={
                            bar.from > (periods.length * 2) / 3
                              ? { gridColumn: `1 / ${bar.to + 1}`, justifySelf: 'end' }
                              : { gridColumn: `${bar.from} / -1` }
                          }>
                          {smartPunctuation(bar.label)}
                        </span>
                      )}
                      <span
                        className="kit-schedule-bar"
                        aria-hidden="true"
                        data-decorative=""
                        style={{ gridColumn: `${bar.from} / ${bar.to + 1}` }}
                      />
                    </figure>
                  ))}
                </section>
              );
              return (
                <div key={index} className="kit-schedule-lane-frame">
                  {reveal ? <Step at={index + 1}>{content}</Step> : content}
                </div>
              );
            })}
            {now === undefined ? null : (
              <div className="kit-schedule-now-line" aria-hidden="true" data-decorative="" />
            )}
          </div>
        </div>
      </Region>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

/**
 * Measures the axis and every lane at their required height, including hidden steps. The stretched
 * grid's own box stays at the region height even when its lanes need more room. Lane offsets avoid
 * accumulating the rounding error of six fractional row heights.
 */
function scheduleHeight(grid: HTMLElement): number {
  const axis = grid.querySelector<HTMLElement>('.kit-schedule-axis');
  const lanes = Array.from(grid.querySelectorAll<HTMLElement>('.kit-schedule-lane-frame'));
  const bottom = Math.max(0, ...lanes.map((lane) => lane.offsetTop + lane.offsetHeight));
  return (axis?.offsetHeight ?? 0) + bottom;
}

/**
 * The schedule layout's runtime component.
 */
export const scheduleLayout = defineLayout<typeof scheduleLayoutContract>({
  name: 'schedule',
  component: ScheduleLayout,
});
