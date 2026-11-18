import { useBrand } from '@deckster/brand/runtime';
import { defineLayout, useStatic, type LayoutProps } from '@deckster/engine';
import { useId, useRef, type ReactNode } from 'react';

import type { beforeAfterLayoutContract } from '#layouts/before-after-layout.contract.ts';

import { useFitLevel } from '#foundation/fit-level.ts';
import { FrontmatterPicture } from '#foundation/frontmatter-picture.tsx';
import { Footnote, Frame, Region, SlideHeader } from '#foundation/slide-parts.tsx';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { enterProps, useEnter } from '#motion/enter.ts';
import { Step } from '#motion/step.tsx';
import '#layouts/before-after-layout.css';

/**
 * The first picture's entrance order, after the header and context.
 */
const FIRST_PICTURE_ORDER = 2;

/**
 * The caption levels tried above equal image wells, from small text to compact captions.
 */
const LEVELS = [{ caption: 'small' }, { caption: 'caption' }] as const;

/**
 * Two equal image wells share their label and caption tracks, even when only one caption exists.
 * The grid fills the available height, so sparse slides grow their pictures; dense slides step down
 * their captions before reducing the image wells. Reveal keeps the full pair's geometry. Each side
 * reads in order: label, picture, caption.
 */
function BeforeAfterLayout({
  frontmatter,
  slots,
}: LayoutProps<typeof beforeAfterLayoutContract>): ReactNode {
  const isStatic = useStatic();
  const contextEnter = useEnter(1);
  const onAccent = useBrand().surface.name === 'accent';
  const labelId = useId();
  const region = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const { before, after, reveal, accent, fit, treatment } = frontmatter;
  const key = JSON.stringify([
    before,
    after,
    frontmatter.title,
    slots.body === undefined,
    slots.footnote === undefined,
  ]);
  const { level } = useFitLevel(region, grid, LEVELS.length, key, {
    overflow: true,
    restartOnFontLoad: true,
  });
  const size = LEVELS[level] ?? LEVELS[1];
  const hasCaption = before.caption !== undefined || after.caption !== undefined;
  return (
    <Frame
      layout="before-after"
      variant={{
        'data-level': String(level),
        'data-caption': String(hasCaption),
        'data-fit': fit,
      }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} maxLines={1} />
      {slots.body === undefined ? null : (
        <div className="kit-before-after-context kit-prose kit-body" {...contextEnter}>
          {slots.body}
        </div>
      )}
      <Region ref={region} className="kit-before-after-region">
        <div ref={grid} className="kit-before-after">
          {[before, after].map((picture, index) => {
            const content = (
              <figure
                key={index}
                className="kit-before-after-item"
                aria-labelledby={`${labelId}-${index}${picture.caption === undefined ? '' : ` ${labelId}-${index}-caption`}`}
                {...enterProps(FIRST_PICTURE_ORDER + index, isStatic)}>
                <p
                  id={`${labelId}-${index}`}
                  className="kit-before-after-label kit-type-label"
                  data-side={index === 0 ? 'before' : 'after'}
                  data-highlight={index === 1 && accent === 'after' && !onAccent ? '' : undefined}>
                  {index === 0 ? null : (
                    <svg
                      className="kit-before-after-arrow"
                      aria-hidden="true"
                      data-decorative=""
                      viewBox="0 0 24 24"
                      focusable="false">
                      <path d="M4 12h15M13 6l6 6-6 6" />
                    </svg>
                  )}
                  {smartPunctuation(picture.label)}
                </p>
                <FrontmatterPicture
                  className="kit-before-after-picture"
                  src={picture.src}
                  alt={picture.alt}
                  fit={fit}
                  focal={picture.focal}
                  treatment={treatment ?? (fit === 'contain' ? 'plain' : undefined)}
                />
                {picture.caption === undefined ? null : (
                  <figcaption
                    id={`${labelId}-${index}-caption`}
                    className={`kit-before-after-caption kit-type-${size.caption}`}>
                    {smartPunctuation(picture.caption)}
                  </figcaption>
                )}
              </figure>
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
 * The `before-after` layout's runtime component.
 */
export const beforeAfterLayout = defineLayout<typeof beforeAfterLayoutContract>({
  name: 'before-after',
  component: BeforeAfterLayout,
});
