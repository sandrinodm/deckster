import type { ReactNode } from 'react';

import { defineLayout, type LayoutProps } from '@deckster/engine';

import type { roadmapTransitLayoutContract } from '#layouts/roadmap-transit-layout.contract.ts';

import { smartPunctuation } from '#layout-parts.ts';
import { patternPosition, PatternSlide, usePatternStage } from '#layouts/pattern-slide.tsx';
import '#layouts/roadmap-transit-layout.css';

/**
 * Horizontal positions of the four stations in percent of the composition width.
 */
const STATION_X = [22, 44, 66, 88] as const;

/**
 * The three rail lines in percent of the composition height.
 */
const TRACK_Y = [23, 52, 81] as const;

/**
 * The tracks stay fixed while the cross-track transfer and dependent milestone appear.
 */
function RoadmapTransit({
  frontmatter,
  slots,
}: LayoutProps<typeof roadmapTransitLayoutContract>): ReactNode {
  const { title, eyebrow, reveal, periods, tracks, transfer, milestone } = frontmatter;
  const stage = usePatternStage(reveal, 2);
  const shown = stage >= 1;
  const transferX = STATION_X[transfer.stop - 1] ?? STATION_X[1];
  const from = TRACK_Y[transfer.from - 1] ?? TRACK_Y[0];
  const to = TRACK_Y[transfer.to - 1] ?? TRACK_Y[1];
  return (
    <PatternSlide
      layout="roadmap-transit"
      eyebrow={eyebrow}
      title={title}
      footnote={slots.footnote}>
      <div className="kit-transit-map">
        <svg
          className="kit-pattern-plot"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true">
          {TRACK_Y.map((y, i) => (
            <line
              key={y}
              className="kit-transit-line"
              data-transit-track={i}
              x1={STATION_X[0]}
              x2={STATION_X[3]}
              y1={y}
              y2={y}
            />
          ))}
          <path
            className="kit-transit-transfer"
            d={`M${transferX},${from}V${to}`}
            pathLength={1}
            data-pattern-draw={shown}
          />
        </svg>
        <div className="kit-transit-periods" aria-label="Periods">
          {periods.map((period, i) => (
            <span
              key={i}
              className="kit-transit-period kit-type-label"
              style={patternPosition(STATION_X[i] ?? 0, 4)}>
              {smartPunctuation(period)}
            </span>
          ))}
        </div>
        <ol className="kit-transit-tracks" aria-label="Workstreams">
          {tracks.map(({ name, stops }, i) => (
            <li key={i} data-transit-track={i}>
              <h3
                className="kit-transit-name kit-type-small"
                style={patternPosition(0, TRACK_Y[i] ?? 0)}>
                {smartPunctuation(name)}
              </h3>
              {stops.map((label, column) =>
                label === null ? null : (
                  <div
                    key={column}
                    className="kit-transit-stop"
                    style={patternPosition(STATION_X[column] ?? 0, TRACK_Y[i] ?? 0)}>
                    <p className="kit-type-caption">
                      <span className="kit-pattern-sr-only" data-decorative="">
                        {smartPunctuation(periods[column] ?? '')}:{' '}
                      </span>
                      {smartPunctuation(label)}
                    </p>
                  </div>
                ),
              )}
            </li>
          ))}
        </ol>
        <p
          className="kit-transit-connection kit-type-caption"
          style={patternPosition(transferX, Math.min(from, to) + 0.63 * Math.abs(from - to))}
          data-pattern-visible={shown}
          aria-hidden={!shown}>
          <span className="kit-pattern-sr-only" data-decorative="">
            {periods[transfer.stop - 1]}, transfer from {tracks[transfer.from - 1]?.name} to{' '}
            {tracks[transfer.to - 1]?.name}:{' '}
          </span>
          {smartPunctuation(transfer.label)}
        </p>
      </div>
      <p
        className="kit-transit-milestone kit-type-small"
        data-pattern-visible={stage >= 2}
        aria-hidden={stage < 2}>
        {smartPunctuation(milestone)}
      </p>
    </PatternSlide>
  );
}

/**
 * Draws parallel lines at shared dates in a dependency roadmap.
 */
export const roadmapTransitLayout = defineLayout<typeof roadmapTransitLayoutContract>({
  name: 'roadmap-transit',
  component: RoadmapTransit,
});
