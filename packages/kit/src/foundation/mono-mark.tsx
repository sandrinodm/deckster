import { useReadyHold } from '@deckster/engine';
import { useId, useState, type CSSProperties, type ReactNode } from 'react';

import { frontmatterAsset } from '#foundation/frontmatter-assets.ts';
import { useSlideFile } from '#foundation/slide-file.ts';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { outcomeFor, type LogoState } from '#layouts/logo-state.ts';
import '#foundation/mono-mark.css';

/**
 * How much each channel adds to a color's lightness (Rec. 709 weights), as the logos layout counts
 * it.
 */
const LUMINANCE = [0.2126, 0.7152, 0.0722] as const;

/**
 * How strongly darkness becomes opacity: a mid-tone mark is fully opaque, and only near-white parts
 * fade out, as on the logos layout's mono wall.
 */
const DARKNESS_GAIN = 2.4;

/**
 * The aspect ratio a mark is laid out at until its file has loaded: a typical wordmark.
 */
const DEFAULT_ASPECT = 2.5;

/**
 * Characters a React id has that a CSS `url(#id)` reference cannot.
 */
const NON_WORD = /\W/gu;

/**
 * Inline styles with custom properties, which `CSSProperties` does not list.
 */
type CustomPropertyStyle = CSSProperties & Record<`--${string}`, string | number>;

/**
 * Props of {@link MonoMark}.
 */
type MonoMarkProps = {
  /**
   * The organisation's name: the mark's alt text, and the wordmark set when it has no file.
   */
  name: string;

  /**
   * The mark's file as the frontmatter names it, if it has one.
   */
  src: string | undefined;

  /**
   * Extra classes, for the layout's size and tone.
   */
  className?: string;
};

/**
 * An organisation's mark set small and in one tone of the surface, for a line of attribution or a
 * row of past employers: every pixel's darkness becomes its opacity and the tone is flooded in, so
 * a color logo becomes a one-color drawing of itself with its inner detail kept, as on the logos
 * layout's mono wall. Its width is the square root of its aspect ratio times a base the layout sets
 * (`--kit-mark-size`), so a wordmark and an emblem carry about the same weight, within a height
 * (`--kit-mark-height`); marks stand on their foot, so a row of them shares one baseline. Until the
 * file has loaded it holds the slide's `ready()`; without a file, or when the file fails, the name
 * is set in the label style instead.
 */
export function MonoMark({ name, src, className }: MonoMarkProps): ReactNode {
  const source = frontmatterAsset(src, useSlideFile());
  const [state, setState] = useState<LogoState<number> | undefined>(undefined);
  const aspect = outcomeFor(state, source);
  const filterId = `kit-mark-mono-${useId().replaceAll(NON_WORD, '')}`;
  useReadyHold(source !== undefined && aspect === undefined);

  const extra = className === undefined ? '' : ` ${className}`;
  if (source === undefined || aspect === 'failed') {
    return (
      <span className={`kit-mono-mark kit-mono-mark-name kit-type-label${extra}`}>
        {smartPunctuation(name)}
      </span>
    );
  }

  const style: CustomPropertyStyle = {
    '--kit-mark-aspect': aspect ?? DEFAULT_ASPECT,
    '--kit-mark-filter': `url(#${filterId})`,
  };
  return (
    <span className={`kit-mono-mark${extra}`} style={style}>
      <img
        className="kit-mono-mark-image"
        src={source}
        alt={name}
        onLoad={(event) => {
          const { naturalWidth, naturalHeight } = event.currentTarget;
          const measured =
            naturalWidth > 0 && naturalHeight > 0 ? naturalWidth / naturalHeight : DEFAULT_ASPECT;
          setState({ source, outcome: measured });
        }}
        onError={() => {
          setState({ source, outcome: 'failed' });
        }}
      />
      <MonoFilter id={filterId} />
    </span>
  );
}

/**
 * Props of {@link MonoFilter}.
 */
type MonoFilterProps = {
  /**
   * The filter id the mark refers to.
   */
  id: string;
};

/**
 * The SVG filter that sets a mark in one tone: each pixel's darkness becomes its opacity and the
 * tone (`.kit-mono-mark-flood`) is flooded in. It is the logos layout's mono filter, kept here so a
 * layout that sets one or two marks does not depend on that layout.
 */
function MonoFilter({ id }: MonoFilterProps): ReactNode {
  const [red, green, blue] = LUMINANCE.map((weight) => -DARKNESS_GAIN * weight);
  // The alpha row is DARKNESS_GAIN times the pixel's alpha minus its luminance, so the darker a
  // pixel is, the more of the tone shows through it.
  const alpha = `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${red} ${green} ${blue} ${DARKNESS_GAIN} 0`;
  return (
    <svg className="kit-treatment-filter" aria-hidden="true" data-decorative="" focusable="false">
      <filter id={id} colorInterpolationFilters="sRGB">
        <feColorMatrix in="SourceGraphic" type="matrix" values={alpha} result="ink" />
        <feFlood className="kit-mono-mark-flood" result="tone" />
        <feComposite in="tone" in2="ink" operator="in" />
      </filter>
    </svg>
  );
}
