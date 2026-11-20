import type { ReactNode } from 'react';

import { defineLayout, type LayoutProps } from '@deckster/engine';

import type { PatternImageData } from '#layouts/pattern-slide.contract.ts';
import type { sketchToShipLayoutContract } from '#layouts/sketch-to-ship-layout.contract.ts';

import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import {
  PatternImage,
  patternPosition,
  PatternSlide,
  usePatternStage,
} from '#layouts/pattern-slide.tsx';
import '#layouts/sketch-to-ship-layout.css';

/**
 * The numbered-by-position points shared by the two sides are exposed as two visible labels.
 */
type SketchProps = LayoutProps<typeof sketchToShipLayoutContract>;

/**
 * Keeps both drawings on the same scale and reveals the released design alongside the draft.
 */
function SketchToShip({ frontmatter, slots }: SketchProps): ReactNode {
  const { title, eyebrow, reveal, sketch, finished, annotations, result } = frontmatter;
  const shipped = usePatternStage(reveal, 1) === 1;
  return (
    <PatternSlide layout="sketch-to-ship" eyebrow={eyebrow} title={title} footnote={slots.footnote}>
      <div className="kit-sketch-pair">
        <DesignView image={sketch} annotations={annotations} side="sketch" shown />
        <span className="kit-sketch-arrow" aria-hidden="true">
          →
        </span>
        <DesignView image={finished} annotations={annotations} side="finished" shown={shipped} />
      </div>
      <p
        className="kit-sketch-result kit-type-small"
        data-pattern-visible={shipped}
        aria-hidden={!shipped}>
        {smartPunctuation(result)}
      </p>
    </PatternSlide>
  );
}

/**
 * Draws a single design document with its pinned labels on top of the artwork.
 */
function DesignView({
  image,
  side,
  annotations,
  shown,
}: {
  image: PatternImageData;
  side: 'sketch' | 'finished';
  annotations: SketchProps['frontmatter']['annotations'];
  shown: boolean;
}): ReactNode {
  return (
    <figure
      className="kit-sketch-view"
      data-sketch-side={side}
      data-pattern-visible={shown}
      aria-hidden={!shown}>
      <figcaption className="kit-type-label">
        {side === 'sketch' ? 'Working sketch' : 'Shipped design'}
      </figcaption>
      <div className="kit-sketch-art">
        <PatternImage image={image} />
        {annotations.map((annotation, index) => {
          const { x, y } = annotation[side];
          return (
            <span
              key={index}
              className="kit-sketch-pin kit-type-caption"
              style={patternPosition(x, y)}>
              {smartPunctuation(annotation.label)}
            </span>
          );
        })}
      </div>
    </figure>
  );
}

/**
 * The reusable paired view from a working draft to its released design.
 */
export const sketchToShipLayout = defineLayout<typeof sketchToShipLayoutContract>({
  name: 'sketch-to-ship',
  component: SketchToShip,
});
