import type { CSSProperties, ReactNode } from 'react';

import { useStatic, useStepAt } from '@deckster/engine';

import type { PatternImageData } from '#layouts/pattern-slide.contract.ts';

import { useSlideFile } from '#foundation/slide-file.ts';
import { Footnote, Frame, frontmatterAsset, Region, SlideHeader } from '#layout-parts.ts';
import '#layouts/pattern-slide.css';

/**
 * Slide framing common to layouts whose content is a single large composition.
 */
type PatternSlideProps = {
  /**
   * The public layout name, also used by the slide renderer.
   */
  layout: string;

  /**
   * Optional context above the slide's assertion.
   */
  eyebrow: string | undefined;

  /**
   * The assertion rendered by the shared slide header.
   */
  title: string | undefined;

  /**
   * The artwork and labels in reading order.
   */
  children: ReactNode;

  /**
   * An optional source or caveat below the composition.
   */
  footnote: ReactNode;
};

/**
 * Wraps a visual pattern in the standard title, content region and optional source.
 */
export function PatternSlide({
  layout,
  eyebrow,
  title,
  children,
  footnote,
}: PatternSlideProps): ReactNode {
  const still = useStatic();
  return (
    <Frame layout={layout} variant={{ 'data-pattern-static': String(still) }}>
      <SlideHeader eyebrow={eyebrow} title={title} />
      <Region className="kit-pattern-region">{children}</Region>
      <Footnote>{footnote}</Footnote>
    </Frame>
  );
}

/**
 * Registers up to two visual updates and returns the current beat, with zero at entry. Layouts
 * without a reveal start at their final beat. Static capture can address every registered beat.
 */
export function usePatternStage(reveal: boolean, last: 1 | 2): number {
  const first = useStepAt(reveal ? 1 : undefined);
  const second = useStepAt(reveal && last === 2 ? 2 : undefined);
  return Number(first !== 'hidden') + Number(last === 2 && second !== 'hidden');
}

/**
 * A local frontmatter image. An unresolved relative path is reported during the MDX build.
 */
export function PatternImage({ image }: { image: PatternImageData }): ReactNode {
  const source = frontmatterAsset(image.src, useSlideFile());
  const style = image.focal === undefined ? undefined : { objectPosition: image.focal };
  return source === undefined ? null : <img src={source} alt={image.alt} style={style} />;
}

/**
 * Positions a plot label on a normalized coordinate, measured from the top left in percent.
 */
export function patternPosition(x: number, y: number): CSSProperties {
  return { left: `${x}%`, top: `${y}%` };
}
