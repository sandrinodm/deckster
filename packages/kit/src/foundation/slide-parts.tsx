import type { BackgroundLayerTokens } from '@deckster/brand';

import { useCallback, useRef, type ReactNode, type Ref } from 'react';

import { Backdrop } from '#foundation/backdrop.tsx';
import { fitSteps, useFitLadder, type FitRung } from '#foundation/fit-text.ts';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { useEnter } from '#motion/enter.ts';
import '#foundation/type.css';
import '#foundation/frame.css';
import '#foundation/header.css';
import '#foundation/prose.css';
import '#foundation/table.css';
import '#foundation/treatment.css';

/**
 * The most lines a content slide's title takes before it steps down in size.
 */
export const TITLE_MAX_LINES = 2;

/**
 * The footnote's place in the slide entrance: after the header, the body and its neighbours.
 */
const FOOTNOTE_ENTER_ORDER = 4;

/**
 * Props of {@link Frame}.
 */
type FrameProps = {
  /**
   * The layout name, set as `data-layout` for tools and tests.
   */
  layout: string;

  /**
   * Extra classes for the safe area, for the layout's own grid.
   */
  className?: string;

  /**
   * Data attributes that name the layout's variant, such as `{ 'data-side': 'left' }`.
   */
  variant?: Readonly<Record<`data-${string}`, string | undefined>>;

  /**
   * Media that runs past the margins to the slide edges, drawn outside the safe area.
   */
  bleed?: ReactNode;

  /**
   * Whether the surface's background layers and the slide's own `background:` image are drawn
   * behind the content; `false` for a layout whose media covers the whole slide.
   */
  backdrop?: boolean;

  /**
   * Background layers to draw instead of the surface's own, for a layout with artwork of its own.
   */
  layers?: readonly BackgroundLayerTokens[] | undefined;

  /**
   * The layout's regions, laid out inside the safe area.
   */
  children?: ReactNode;
};

/**
 * The root of every kit layout. It covers the 1920x1080 slide, sets the brand's body type as the
 * base for everything on it (so a plain table, `div` or quote reads as slide text), and holds the
 * safe area: a box exactly inside the brand's margins that the layout's regions stack in. Content
 * that does not fit overflows the safe area, so `deckster lint` reports it before it reaches the
 * chrome in the margins. Only media that bleeds to the slide edges sits outside it; a layout that
 * bleeds names the edges in `defineLayout({ bleed })`, so the chrome moves off them. Behind
 * everything it draws the surface's background layers and the slide's own `background:` image
 * (`Backdrop`).
 */
export function Frame({
  layout,
  className,
  variant,
  bleed,
  backdrop = true,
  layers,
  children,
}: FrameProps): ReactNode {
  return (
    <div className="kit-frame" data-layout={layout} {...variant}>
      {backdrop ? <Backdrop layers={layers} /> : null}
      <div className={className === undefined ? 'kit-safe' : `kit-safe ${className}`}>
        {children}
      </div>
      {bleed}
    </div>
  );
}

/**
 * Props of {@link Region}.
 */
type RegionProps = {
  /**
   * Extra classes for the region.
   */
  className?: string;

  /**
   * How the content sits in the region's height: from the top (the default), or `optical`, a little
   * above the middle of the free space.
   */
  place?: 'top' | 'optical';

  /**
   * The region element, for a layout that measures how full it is.
   */
  ref?: Ref<HTMLDivElement>;

  /**
   * What fills the region: a chart, diagram, table, code, a demo, or a layout's body.
   */
  children?: ReactNode;
};

/**
 * The height left in a layout's column, given to what it holds: the region grows to fill its column
 * between the parts above and below it, and is a size container, so a chart or a demo inside can
 * size itself with `100cqh` and `100cqw` or fill it with `height: 100%`. Content that is taller
 * than the region spills out of it, which `deckster lint` reports.
 */
export function Region({ className, place = 'top', ref, children }: RegionProps): ReactNode {
  return (
    <div
      ref={ref}
      className={className === undefined ? 'kit-region' : `kit-region ${className}`}
      data-place={place}>
      {children}
    </div>
  );
}

/**
 * Props of {@link Eyebrow}.
 */
type EyebrowProps = {
  /**
   * The kicker text; nothing renders for none, but the row keeps its height when `reserve` is set.
   */
  text: string | undefined;

  /**
   * Keep the eyebrow row's height when there is no text, so the title below stays on its line.
   */
  reserve?: boolean;
};

/**
 * The eyebrow (kicker) above a title: the brand's label style in the accent color, after a short
 * rule, with typographic punctuation.
 */
export function Eyebrow({ text, reserve = false }: EyebrowProps): ReactNode {
  if (text === undefined) {
    return reserve ? <p className="kit-eyebrow" aria-hidden="true" /> : null;
  }

  return <p className="kit-eyebrow kit-type-label">{smartPunctuation(text)}</p>;
}

/**
 * Props of {@link SlideHeader}.
 */
type SlideHeaderProps = {
  /**
   * The eyebrow above the title.
   */
  eyebrow: string | undefined;

  /**
   * The slide title from the frontmatter.
   */
  title: string | undefined;

  /**
   * The title element id, for regions labelled by the slide title.
   */
  titleId?: string;

  /**
   * The most lines the title takes before it steps down in size.
   */
  maxLines?: number;
};

/**
 * The header every content slide shares: the eyebrow row on the top line (reserved when empty) and
 * the title on the title line, so titles sit at the same height on every content slide. Long titles
 * step down in size instead of taking a third line.
 */
export function SlideHeader({
  eyebrow,
  title,
  titleId,
  maxLines = TITLE_MAX_LINES,
}: SlideHeaderProps): ReactNode {
  return (
    <header className="kit-header" {...useEnter(0)}>
      <Eyebrow text={eyebrow} reserve />
      <FittedText
        as="h2"
        id={titleId}
        className="kit-title kit-heading kit-type-headline"
        maxLines={maxLines}>
        {title}
      </FittedText>
    </header>
  );
}

/**
 * Props of {@link FittedText}.
 */
type FittedTextProps = {
  /**
   * The element to render.
   */
  as: 'h1' | 'h2' | 'p' | 'blockquote' | 'div';

  /**
   * The element id, when another region refers to this text.
   */
  id?: string | undefined;

  /**
   * Classes, including one `kit-type-*` class that sets the size to step down from.
   */
  className: string;

  /**
   * The most lines the text may take at every fit step; ignored when `ladder` is given.
   */
  maxLines?: number;

  /**
   * The sizes to try, largest first, each with its own line budget and optionally another type
   * step; the fit steps of the element's own type step when left out.
   */
  ladder?: readonly FitRung[];

  /**
   * A selector for an ancestor the text must leave room in; see `useFitLadder`.
   */
  boundary?: string;

  /**
   * The text; nothing renders when it is empty. A string gets typographic punctuation.
   */
  children?: ReactNode;
};

/**
 * Text that steps down through the kit's fit sizes until it takes at most its lines, no word is
 * wider than its box and, with a `boundary`, the ancestor it names does not overflow.
 */
export function FittedText({
  as: Tag,
  id,
  className,
  maxLines = 1,
  ladder,
  boundary,
  children,
}: FittedTextProps): ReactNode {
  const ref = useRef<HTMLElement | null>(null);
  const setRef = useCallback((node: HTMLElement | null) => {
    ref.current = node;
  }, []);
  useFitLadder(ref, ladder ?? fitSteps(maxLines), boundary);
  if (children === undefined || children === null || children === '') {
    return null;
  }

  return (
    <Tag ref={setRef} id={id} className={`kit-fitted ${className}`}>
      {typeof children === 'string' ? smartPunctuation(children) : children}
    </Tag>
  );
}

/**
 * Props of {@link Footnote}.
 */
type FootnoteProps = {
  /**
   * The footnote slot's content.
   */
  children?: ReactNode;
};

/**
 * A source line or caveat standing on the bottom line, in the caption style, its lines balanced.
 */
export function Footnote({ children }: FootnoteProps): ReactNode {
  const enter = useEnter(FOOTNOTE_ENTER_ORDER);
  if (children === undefined) {
    return null;
  }

  return (
    <div className="kit-footnote kit-type-caption" {...enter}>
      {children}
    </div>
  );
}
