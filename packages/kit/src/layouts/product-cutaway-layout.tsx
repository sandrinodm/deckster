import type { CSSProperties, ReactNode } from 'react';

import { defineLayout, useStatic, useStepAt, type LayoutProps } from '@deckster/engine';

import type {
  ProductCutawayLayer,
  productCutawayLayoutContract,
} from '#layouts/product-cutaway-layout.contract.ts';

import { frontmatterAsset } from '#foundation/frontmatter-assets.ts';
import { useSlideFile } from '#foundation/slide-file.ts';
import { Footnote, Frame, Region, SlideHeader } from '#foundation/slide-parts.tsx';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import '#layouts/product-cutaway-layout.css';

/**
 * The click that exposes the second layer.
 */
const FIRST_LAYER_STEP = 1;

/**
 * The click that exposes the third layer, when there is one.
 */
const LAST_LAYER_STEP = 2;

/**
 * Offsets for a layer relative to the middle of the stack.
 */
type LayerStyle = CSSProperties & {
  /**
   * Layer offset, in row heights, after separation.
   */
  '--kit-cutaway-offset': number;
  /**
   * Layer offset, in narrow edge widths, before separation.
   */
  '--kit-cutaway-depth': number;
  /**
   * The artwork stays in front of all the layers behind it.
   */
  zIndex: number;
};

/**
 * Draws the same illustrated parts in both states, so they move together when reversing.
 */
function ProductCutawayLayout({
  frontmatter,
  slots,
}: LayoutProps<typeof productCutawayLayoutContract>): ReactNode {
  const { eyebrow, title, layers, reveal, takeaway } = frontmatter;
  const secondShown = useStepAt(reveal ? FIRST_LAYER_STEP : undefined) !== 'hidden';
  const hasThird = layers.length > 2;
  const thirdShown = useStepAt(reveal && hasThird ? LAST_LAYER_STEP : undefined) !== 'hidden';
  const shown = 1 + Number(secondShown) + Number(hasThird && thirdShown && secondShown);
  const finished = shown === layers.length;
  const isStatic = useStatic();
  const slideFile = useSlideFile();

  return (
    <Frame
      layout="product-cutaway"
      variant={{
        'data-cutaway-count': String(shown),
        'data-cutaway-static': String(isStatic),
      }}>
      <SlideHeader eyebrow={eyebrow} title={title} />
      <Region className="kit-cutaway-region">
        <ol
          className="kit-cutaway kit-grid"
          aria-label={shown > 1 ? 'Product layers' : 'Assembled product'}
          data-layer-count={layers.length}>
          {layers.map((layer, index) => (
            <Layer
              key={index}
              layer={layer}
              number={index + 1}
              count={layers.length}
              source={frontmatterAsset(layer.src, slideFile)}
              shown={shown}
            />
          ))}
        </ol>
        <p className="kit-cutaway-takeaway kit-type-lead" aria-hidden={!finished}>
          {smartPunctuation(takeaway)}
        </p>
      </Region>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

/**
 * The cutaway runtime layout. Its contract limits the stage to two or three parts.
 */
export const productCutawayLayout = defineLayout<typeof productCutawayLayoutContract>({
  name: 'product-cutaway',
  component: ProductCutawayLayout,
});

/**
 * One part of the cutaway and its corresponding annotation.
 */
type LayerProps = {
  /**
   * The illustrated layer and its annotation.
   */
  layer: ProductCutawayLayer;

  /**
   * The layer's one-based position.
   */
  number: number;

  /**
   * The number of illustrated layers.
   */
  count: number;

  /**
   * The resolved image URL, if found.
   */
  source: string | undefined;

  /**
   * The number of parts exposed so far.
   */
  shown: number;
};

/**
 * Keeps the artwork and annotation in one accessible list item for reading order.
 */
function Layer({ layer, number, count, source, shown }: LayerProps): ReactNode {
  const exposed = number <= shown;
  const labelVisible = exposed && shown > 1;
  const style: LayerStyle = {
    '--kit-cutaway-offset': Math.min(number, shown) - (shown + 1) / 2,
    '--kit-cutaway-depth': Math.max(0, number - shown),
    zIndex: count - number,
  };
  return (
    <li className="kit-cutaway-layer" aria-hidden={!exposed} style={style}>
      <div className="kit-cutaway-art">
        {source === undefined ? null : <img src={source} alt={layer.alt} />}
      </div>
      <div className="kit-cutaway-label" aria-hidden={!labelVisible}>
        <span className="kit-cutaway-number kit-type-label" aria-hidden="true">
          {number}
        </span>
        <div>
          <p className="kit-cutaway-name kit-type-title">{smartPunctuation(layer.label)}</p>
          <p className="kit-cutaway-detail kit-type-body">{smartPunctuation(layer.detail)}</p>
        </div>
      </div>
    </li>
  );
}
