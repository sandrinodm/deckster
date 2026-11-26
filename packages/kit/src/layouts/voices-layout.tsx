import { defineLayout, useStatic, type LayoutProps } from '@deckster/engine';
import { useRef, type CSSProperties, type ReactNode } from 'react';

import type { VoiceEntry, voicesLayoutContract } from '#layouts/voices-layout.contract.ts';

import { MEASURE_TOLERANCE_PX } from '#foundation/layout-geometry.ts';
import { Portrait } from '#foundation/portrait.tsx';
import { stripQuoteMarks } from '#foundation/quote-marks.ts';
import {
  enterProps,
  Footnote,
  Frame,
  Region,
  SlideHeader,
  smartPunctuation,
  Step,
  useEnter,
  useFitLevel,
  type EnterProps,
} from '#layout-parts.ts';
import '#layouts/voices-layout.css';

/**
 * The first speaker enters after the header and context.
 */
const FIRST_VOICE_ORDER = 2;

/**
 * A testimonial stays within three lines at every fit level.
 */
const QUOTE_MAX_LINES = 3;

/**
 * The smallest fraction of the brand quote size, used when the row is dense.
 */
const MIN_QUOTE_SCALE = 0.52;

/**
 * Quote scales, largest first: two speakers start at the full quote size, then 0.9 and 0.78; three
 * start at 0.68. Both counts share the 0.6 and 0.52 dense levels. Every speaker shares a scale and
 * stays within three lines.
 */
const VOICE_SCALES = [1, 0.9, 0.78, 0.68, 0.6, MIN_QUOTE_SCALE] as const;

/**
 * The columns and quote scale shared by the whole row.
 */
type VoicesStyle = CSSProperties & {
  /**
   * How many speakers share the row.
   */
  '--kit-voices-count': number;

  /**
   * The fraction of the brand quote size used by each speaker.
   */
  '--kit-voices-scale': number;
};

/**
 * Equal testimonial columns with their quotes and attribution rows aligned by a subgrid. The row
 * tries larger quote sizes first and steps down together until every quote fits three lines and the
 * row fits the available height. Hidden reveal items still take part in that measurement.
 */
function VoicesLayout({ frontmatter, slots }: LayoutProps<typeof voicesLayoutContract>): ReactNode {
  const isStatic = useStatic();
  const contextEnter = useEnter(1);
  const region = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const { voices, reveal } = frontmatter;
  const scales = voices.length === 2 ? VOICE_SCALES : VOICE_SCALES.slice(3);
  const key = JSON.stringify([
    voices,
    frontmatter.title,
    slots.body === undefined,
    slots.footnote === undefined,
  ]);
  const { level } = useFitLevel(region, grid, scales.length, key, {
    height: voicesHeight,
    restartOnFontLoad: true,
  });
  const style: VoicesStyle = {
    '--kit-voices-count': voices.length,
    '--kit-voices-scale': scales[level] ?? MIN_QUOTE_SCALE,
  };
  return (
    <Frame
      layout="voices"
      variant={{
        'data-count': String(voices.length),
        // This is the rung in VOICE_SCALES; both counts share the same floor.
        'data-level': String(level + (voices.length === 2 ? 0 : 3)),
      }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} maxLines={2} />
      {slots.body === undefined ? null : (
        <div className="kit-voices-context kit-prose kit-body" {...contextEnter}>
          {slots.body}
        </div>
      )}
      <Region ref={region} className="kit-voices-region" place="optical">
        <div ref={grid} className="kit-voices" style={style}>
          {voices.map((voice, index) => {
            const content = (
              <Testimonial
                key={index}
                voice={voice}
                treatment={frontmatter.treatment}
                enter={enterProps(FIRST_VOICE_ORDER + index, isStatic)}
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
 * The attributed words, portrait treatment and entrance of one speaker.
 */
type TestimonialProps = {
  /**
   * The speaker and their short quote.
   */
  voice: VoiceEntry;

  /**
   * The slide's image treatment, or the brand default when absent.
   */
  treatment: string | undefined;

  /**
   * The speaker's place in the slide entrance.
   */
  enter: EnterProps;
};

/**
 * A semantic quotation with the speaker's name, role and optional portrait.
 */
function Testimonial({ voice, treatment, enter }: TestimonialProps): ReactNode {
  return (
    <figure className="kit-voice" {...enter}>
      <blockquote className="kit-voice-quote kit-heading kit-type-quote" data-fit="scaled">
        {stripQuoteMarks(smartPunctuation(voice.quote))}
      </blockquote>
      <figcaption className="kit-voice-speaker">
        {voice.photo === undefined ? null : (
          <Portrait
            className="kit-voice-avatar"
            name={voice.name}
            photo={voice.photo}
            focal={voice.focal}
            treatment={treatment}
          />
        )}
        <div className="kit-voice-attribution">
          <p className="kit-voice-name kit-type-body">{smartPunctuation(voice.name)}</p>
          <p className="kit-voice-role kit-type-small">{smartPunctuation(voice.role)}</p>
        </div>
      </figcaption>
    </figure>
  );
}

/**
 * The row's natural height, or an unfit height when a quote needs more than three lines. Offset
 * geometry ignores entrance transforms, keeping the result stable throughout a reveal.
 *
 * @param grid - The testimonial grid.
 */
function voicesHeight(grid: HTMLElement): number {
  const quotes = Array.from(grid.querySelectorAll<HTMLElement>('.kit-voice-quote'));
  const tooLong = quotes.some((quote) => {
    const lineHeight = Number.parseFloat(getComputedStyle(quote).lineHeight);
    return quote.offsetHeight > lineHeight * QUOTE_MAX_LINES + MEASURE_TOLERANCE_PX;
  });
  return tooLong ? Number.POSITIVE_INFINITY : Math.max(grid.offsetHeight, grid.scrollHeight);
}

/**
 * The voices layout's runtime component.
 */
export const voicesLayout = defineLayout<typeof voicesLayoutContract>({
  name: 'voices',
  component: VoicesLayout,
});
