import { defineLayout, useStatic, type LayoutProps } from '@deckster/engine';
import { useRef, type ReactNode } from 'react';

import type { recapLayoutContract } from '#layouts/recap-layout.contract.ts';

import { useFitLevel } from '#foundation/fit-level.ts';
import { Footnote, Frame, Region, SlideHeader } from '#foundation/slide-parts.tsx';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { enterProps, useEnter } from '#motion/enter.ts';
import { Step } from '#motion/step.tsx';
import '#layouts/recap-layout.css';

/**
 * The first point enters after the header and context.
 */
const FIRST_POINT_ORDER = 2;

/**
 * The fit ladder, largest first. Sparse takeaways grow to headline size; dense sentences keep the
 * title face. Sparse recaps grow through display numerals, detail and spacing; a compact display
 * level keeps four bare sentences large. Dense recaps reduce detail and gaps before using headline
 * numerals, always larger than their sentences.
 */
const RECAP_LEVELS = [
  { number: 'display', title: 'headline', detail: 'lead', gap: 'large' },
  { number: 'display', title: 'title', detail: 'lead', gap: 'large' },
  { number: 'display', title: 'title', detail: 'body', gap: 'roomy' },
  { number: 'display', title: 'lead', detail: 'small', gap: 'compact' },
  { number: 'headline', title: 'lead', detail: 'small', gap: 'snug' },
  { number: 'headline', title: 'lead', detail: 'small', gap: 'compact' },
  { number: 'title', title: 'body', detail: 'caption', gap: 'compact' },
] as const;

/**
 * Numbered takeaways on shared grid columns. All points keep their space throughout a reveal, and
 * the fit level measures the full list, so advancing a step never moves an earlier point.
 */
function RecapLayout({ frontmatter, slots }: LayoutProps<typeof recapLayoutContract>): ReactNode {
  const isStatic = useStatic();
  const contextEnter = useEnter(1);
  const { points, reveal } = frontmatter;
  const region = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const key = JSON.stringify([
    points,
    frontmatter.title,
    slots.body === undefined,
    slots.footnote === undefined,
  ]);
  const { level } = useFitLevel(region, list, RECAP_LEVELS.length, key, {
    restartOnFontLoad: true,
    overflow: true,
  });
  const size = RECAP_LEVELS[level] ?? RECAP_LEVELS[RECAP_LEVELS.length - 1]!;
  return (
    <Frame
      layout="recap"
      variant={{
        'data-count': String(points.length),
        'data-level': String(level),
        'data-gap': size.gap,
      }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} maxLines={1} />
      {slots.body === undefined ? null : (
        <div className="kit-recap-context kit-prose kit-body" {...contextEnter}>
          {slots.body}
        </div>
      )}
      <Region ref={region} className="kit-recap-region" place="optical">
        <ol ref={list} className="kit-recap-points">
          {points.map((point, index) => {
            const item = (
              <li
                key={index}
                className="kit-recap-point"
                {...enterProps(FIRST_POINT_ORDER + index, isStatic)}>
                <span
                  className={`kit-recap-number kit-numeric kit-type-${size.number}`}
                  aria-hidden="true">
                  {index + 1}
                </span>
                <div className="kit-recap-copy">
                  <h3 className={`kit-recap-title kit-heading kit-type-${size.title}`}>
                    {smartPunctuation(point.title)}
                  </h3>
                  {point.detail === undefined ? null : (
                    <p className={`kit-recap-detail kit-type-${size.detail}`}>
                      {smartPunctuation(point.detail)}
                    </p>
                  )}
                </div>
              </li>
            );
            return reveal ? (
              <Step key={index} at={index + 1}>
                {item}
              </Step>
            ) : (
              item
            );
          })}
        </ol>
      </Region>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

/**
 * The recap layout's runtime component.
 */
export const recapLayout = defineLayout<typeof recapLayoutContract>({
  name: 'recap',
  component: RecapLayout,
});
