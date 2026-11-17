import type { BrandTokens } from '@deckster/brand';

import { PLAIN_TREATMENT } from '@deckster/brand';
import { useBrand } from '@deckster/brand/runtime';
import { defineLayout, useReadyHold, useStatic, type LayoutProps } from '@deckster/engine';
import { useId, useState, type CSSProperties, type ReactNode } from 'react';

import type { LogoEntry, logosLayoutContract } from '#layouts/logos-layout.contract.ts';

import { frontmatterAsset } from '#foundation/frontmatter-assets.ts';
import { TreatedMedia } from '#foundation/media-treatment.tsx';
import { useSlideFile } from '#foundation/slide-file.ts';
import { Footnote, Frame, Region, SlideHeader } from '#foundation/slide-parts.tsx';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { outcomeFor, type LogoState } from '#layouts/logo-state.ts';
import { enterProps, useEnter } from '#motion/enter.ts';
import '#layouts/logos-layout.css';

/**
 * How many logos stand in a row: one row up to five, then two or three rows as even as they can be,
 * never more than six to a row.
 *
 * @param count - The number of logos.
 */
function columnsFor(count: number): number {
  if (count <= MAX_ONE_ROW) {
    return count;
  }

  const rows = count <= MAX_TWO_ROWS ? TWO_ROWS : THREE_ROWS;
  return Math.min(MAX_COLUMNS, Math.ceil(count / rows));
}

/**
 * The rows a wall of more than five logos takes when it has up to twelve.
 */
const TWO_ROWS = 2;

/**
 * The rows a wall of thirteen or more logos takes.
 */
const THREE_ROWS = 3;

/**
 * The most logos in a wall of one row.
 */
const MAX_ONE_ROW = 5;

/**
 * The most logos in a wall of two rows.
 */
const MAX_TWO_ROWS = 12;

/**
 * The most logos in one row.
 */
const MAX_COLUMNS = 6;

/**
 * The aspect ratio a logo is laid out at until its file has loaded: a typical wordmark.
 */
const DEFAULT_ASPECT = 2.5;

/**
 * How much each channel adds to a color's lightness (Rec. 709 weights).
 */
const LUMINANCE = [0.2126, 0.7152, 0.0722] as const;

/**
 * How strongly darkness becomes opacity in the mono treatment: a mid-tone mark is fully opaque, and
 * only near-white parts fade out.
 */
const DARKNESS_GAIN = 2.4;

/**
 * The ink coverage a mark is sized for as it is: about a third of its box, a wordmark of medium
 * weight. Lighter marks grow, heavier ones shrink.
 */
const REFERENCE_INK = 0.32;

/**
 * How much ink decides a mark's size against its area: the exponent on the ink ratio, half of the
 * square root that equal ink alone would take.
 */
const INK_BLEND = 0.25;

/**
 * The most a light mark grows for its ink.
 */
const MAX_INK_WEIGHT = 1.35;

/**
 * The most a solid mark shrinks for its ink.
 */
const MIN_INK_WEIGHT = 0.72;

/**
 * The height, in pixels, a logo is rasterised at to count its ink.
 */
const INK_SAMPLE_HEIGHT = 48;

/**
 * The widest aspect ratio the ink sample keeps; wider marks are squeezed, which does not change
 * their coverage much.
 */
const MAX_SAMPLE_ASPECT = 8;

/**
 * The largest value of a color channel.
 */
const CHANNEL_MAX = 255;

/**
 * The bytes per pixel in the ink sample: red, green, blue and alpha.
 */
const RGBA_CHANNELS = 4;

/**
 * Characters a React id has that a CSS `url(#id)` reference cannot.
 */
const NON_WORD = /\W/gu;

/**
 * The entrance order of the logos; the header and context come before.
 */
const LOGOS_ORDER = 2;

/**
 * The `logos` layout: the shared header and an optional line of context, then the logos in a grid
 * of equal cells closed by rules above and below, a little above the middle of the space down to
 * the footnote. Each mark is sized to the same area whatever its shape (the square root of its
 * aspect ratio sets its width), corrected for its ink so a thin wordmark and a solid emblem carry
 * the same weight, within the cell; with `tone: mono` an SVG filter floods every mark with the
 * surface's text color, keeping its shape; with `tone: color` on a dark surface each mark sits on a
 * light chip, since colour marks are drawn for light paper.
 */
function LogosLayout({ frontmatter, slots }: LayoutProps<typeof logosLayoutContract>): ReactNode {
  const isStatic = useStatic();
  const contextEnter = useEnter(1);
  const filterId = `kit-logo-mono-${useId().replaceAll(NON_WORD, '')}`;
  const { brand, surface } = useBrand();
  const { logos, tone } = frontmatter;
  const columns = columnsFor(logos.length);
  // Colour marks are drawn for light paper: on a dark surface each sits on a light chip.
  const chip = tone === 'color' && surface.scheme === 'dark' ? lightPaper(brand) : undefined;
  const style = {
    '--kit-logo-columns': columns,
    '--kit-logo-rows': Math.ceil(logos.length / columns),
    '--kit-logo-filter': tone === 'mono' ? `url(#${filterId})` : 'none',
    ...(chip === undefined ? {} : { '--kit-logo-chip': chip }),
  } as CSSProperties;
  return (
    <Frame
      layout="logos"
      variant={{
        'data-count': String(logos.length),
        'data-tone': tone,
        'data-chips': String(chip !== undefined),
      }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} />
      {slots.body === undefined ? null : (
        <div className="kit-logos-context kit-prose kit-body" {...contextEnter}>
          {slots.body}
        </div>
      )}
      <Region className="kit-logos-region" place="optical">
        <TreatedMedia
          className="kit-logos"
          rounded={false}
          treatment={frontmatter.treatment ?? PLAIN_TREATMENT}>
          <ul className="kit-logos-grid" style={style} {...enterProps(LOGOS_ORDER, isStatic)}>
            {logos.map((logo, index) => (
              <li key={index} className="kit-logo-cell">
                <LogoMark logo={logo} />
              </li>
            ))}
          </ul>
        </TreatedMedia>
        {tone === 'mono' ? <MonoFilter id={filterId} /> : null}
      </Region>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

/**
 * The background of the brand's lightest light surface, which colour logos sit on as chips on a
 * dark slide; white when the brand has no light surface.
 *
 * @param brand - The brand's tokens.
 */
function lightPaper(brand: BrandTokens): string {
  const light = Object.values(brand.surfaces).find((candidate) => candidate.scheme === 'light');
  return light?.roles.bg ?? '#ffffff';
}

/**
 * Props of {@link LogoMark}.
 */
type LogoMarkProps = {
  /**
   * The logo.
   */
  logo: LogoEntry;
};

/**
 * One logo, sized by its aspect ratio once its file has loaded (the slide's `ready()` waits for
 * it), or the organisation's name set as a wordmark when it has no file or the file fails.
 */
function LogoMark({ logo }: LogoMarkProps): ReactNode {
  const source = frontmatterAsset(logo.src, useSlideFile());
  const [state, setState] = useState<LogoState<Measured> | undefined>(undefined);
  const measured = outcomeFor(state, source);
  useReadyHold(source !== undefined && measured === undefined);
  if (source === undefined || measured === 'failed') {
    return (
      <span
        className="kit-logo-name kit-type-title"
        data-fit="scaled"
        data-missing={logo.src !== undefined}>
        {smartPunctuation(logo.name)}
      </span>
    );
  }

  const style = {
    '--kit-logo-aspect': measured?.aspect ?? DEFAULT_ASPECT,
    '--kit-logo-ink': measured?.weight ?? 1,
    '--kit-logo-scale': logo.scale ?? 1,
  } as CSSProperties;
  return (
    <img
      className="kit-logo-mark"
      src={source}
      alt={logo.name}
      style={style}
      onLoad={(event) => {
        setState({ source, outcome: measureLogo(event.currentTarget) });
      }}
      onError={() => {
        setState({ source, outcome: 'failed' });
      }}
    />
  );
}

/**
 * A loaded logo's shape: its aspect ratio and how much to scale it for its ink.
 */
type Measured = {
  /**
   * Width over height.
   */
  aspect: number;

  /**
   * The size factor for the mark's ink coverage: above 1 for a light, open mark (a thin wordmark),
   * below 1 for a solid one (a filled emblem), so both carry about the same weight.
   */
  weight: number;
};

/**
 * Measures a loaded logo: its aspect ratio, and its ink coverage (the share of its box that is
 * drawn, each pixel counted by its opacity and darkness as the mono treatment draws it) from a
 * small rasterisation, turned into a size factor. The factor blends equal ink with equal area (half
 * of each, as a square root) and is clamped, so no mark is sized by its ink alone.
 *
 * @param image - The loaded logo.
 */
function measureLogo(image: HTMLImageElement): Measured {
  const { naturalWidth, naturalHeight } = image;
  const aspect =
    naturalWidth > 0 && naturalHeight > 0 ? naturalWidth / naturalHeight : DEFAULT_ASPECT;
  const ink = inkCoverage(image, aspect);
  const weight =
    ink === undefined
      ? 1
      : Math.min(MAX_INK_WEIGHT, Math.max(MIN_INK_WEIGHT, (REFERENCE_INK / ink) ** INK_BLEND));
  return { aspect, weight };
}

/**
 * The share of a logo's box its ink covers, 0 to 1, or `undefined` when the picture cannot be read
 * (a cross-origin file).
 *
 * @param image - The loaded logo.
 * @param aspect - Its aspect ratio.
 */
function inkCoverage(image: HTMLImageElement, aspect: number): number | undefined {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(INK_SAMPLE_HEIGHT * Math.min(aspect, MAX_SAMPLE_ASPECT)));
  canvas.height = INK_SAMPLE_HEIGHT;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (context === null) {
    return undefined;
  }

  try {
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let total = 0;
    for (let at = 0; at < pixels.length; at += RGBA_CHANNELS) {
      const [red, green, blue] = [pixels[at] ?? 0, pixels[at + 1] ?? 0, pixels[at + 2] ?? 0];
      const lightness =
        (LUMINANCE[0] * red + LUMINANCE[1] * green + LUMINANCE[2] * blue) / CHANNEL_MAX;
      const darkness = Math.min(1, DARKNESS_GAIN * (1 - lightness));
      total += ((pixels[at + 3] ?? 0) / CHANNEL_MAX) * darkness;
    }

    const coverage = total / (canvas.width * canvas.height);
    return coverage > 0 ? coverage : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Props of {@link MonoFilter}.
 */
type MonoFilterProps = {
  /**
   * The filter id the logos refer to.
   */
  id: string;
};

/**
 * An SVG filter that sets a logo in the surface's muted color: each pixel's darkness becomes its
 * opacity (light parts of a mark, such as the white leaf inside a green disc, turn into the surface
 * showing through), and the color is flooded in. Every mark becomes a one-color drawing of itself
 * with its inner detail kept, whatever colors its file has.
 */
function MonoFilter({ id }: MonoFilterProps): ReactNode {
  const [red, green, blue] = LUMINANCE.map((weight) => -DARKNESS_GAIN * weight);
  const alpha = `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${red} ${green} ${blue} ${DARKNESS_GAIN} 0`;
  return (
    <svg className="kit-treatment-filter" aria-hidden="true" data-decorative="" focusable="false">
      <filter id={id} colorInterpolationFilters="sRGB">
        <feColorMatrix in="SourceGraphic" type="matrix" values={alpha} result="ink" />
        <feFlood className="kit-logo-flood" result="tone" />
        <feComposite in="tone" in2="ink" operator="in" />
      </filter>
    </svg>
  );
}

/**
 * The `logos` layout's component.
 */
export const logosLayout = defineLayout<typeof logosLayoutContract>({
  name: 'logos',
  component: LogosLayout,
});
