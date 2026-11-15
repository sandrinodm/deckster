import type { ReactNode } from 'react';

import { defineLayout, type LayoutProps } from '@deckster/engine';
import { useRef } from 'react';

import type { splitLayoutContract } from '#layouts/split-layout.contract.ts';

import { useDensity, type TextStep } from '#foundation/density.ts';
import { TreatedMedia } from '#foundation/media-treatment.tsx';
import { Footnote, Frame, Region, SlideHeader } from '#foundation/slide-parts.tsx';
import { treatmentProps } from '#layouts/layout-fields.ts';
import { LAYOUT_LIMITS } from '#layouts/layout-limits.ts';
import { useEnter } from '#motion/enter.ts';
import '#layouts/split-layout.css';

/**
 * The type steps the text column tries, smallest first: sparse text is set at the lead step.
 */
const BODY_STEPS: readonly TextStep[] = ['body', 'lead'];

/**
 * The `split` layout: the text column (header, body, footnote) and the media on the side the slide
 * names, sharing the twelve columns by `ratio`. Framed media fills its columns between the top and
 * bottom lines with the caption under it; photos are cropped to the frame in the brand's image
 * treatment, anything else is centred in it. Bleeding media runs to three edges of the slide, and
 * its caption moves to the foot of the text column.
 */
function SplitLayout({ frontmatter, slots }: LayoutProps<typeof splitLayoutContract>): ReactNode {
  const { ratio, side, bleed } = frontmatter;
  const bodyEnter = useEnter(1);
  const mediaEnter = useEnter(bleed ? 0 : 2);
  const region = useRef<HTMLDivElement>(null);
  const prose = useRef<HTMLDivElement>(null);
  useDensity({
    region,
    content: prose,
    prose,
    steps: BODY_STEPS,
    maxLines: (bleed ? LAYOUT_LIMITS.splitBleedBodyLines : LAYOUT_LIMITS.splitBodyLines)[ratio],
  });
  const caption =
    slots.caption === undefined ? null : (
      <div className="kit-split-caption kit-type-caption">{slots.caption}</div>
    );
  const media = (
    <figure className="kit-split-media" {...mediaEnter}>
      <TreatedMedia
        className="kit-split-frame"
        rounded={!bleed}
        {...treatmentProps(frontmatter.treatment)}>
        {slots.media}
      </TreatedMedia>
      {bleed ? null : caption}
    </figure>
  );
  return (
    <Frame
      layout="split"
      variant={{ 'data-ratio': ratio, 'data-side': side, 'data-bleed': String(bleed) }}
      bleed={bleed ? media : undefined}>
      <div className="kit-split-text">
        <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} />
        <Region ref={region} className="kit-body">
          <div ref={prose} className="kit-split-body kit-prose" {...bodyEnter}>
            {slots.body}
          </div>
        </Region>
        {bleed ? caption : null}
        <Footnote>{slots.footnote}</Footnote>
      </div>
      {bleed ? null : media}
    </Frame>
  );
}

/**
 * The `split` layout's component. A bleeding photo covers the edge on its side, so the chrome moves
 * off it.
 */
export const splitLayout = defineLayout<typeof splitLayoutContract>({
  name: 'split',
  component: SplitLayout,
  bleed: ({ frontmatter }) => (frontmatter.bleed ? [frontmatter.side] : []),
});
