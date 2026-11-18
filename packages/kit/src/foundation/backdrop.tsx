import type { BackgroundLayerTokens, TreatmentTokens } from '@deckster/brand';
import type { SlideBackground } from '@deckster/engine/frontmatter';

import { backgroundUrl, useBrand } from '@deckster/brand/runtime';
import { useSlide } from '@deckster/engine';
import { useId, type CSSProperties, type ReactNode } from 'react';

import { frontmatterAsset } from '#foundation/frontmatter-assets.ts';
import { DuotoneFilter, treatmentFilter } from '#foundation/media-treatment.tsx';
import { planTreatment } from '#media/image-treatment.ts';
import '#foundation/backdrop.css';

/**
 * The canvas size every position is measured on.
 */
const CANVAS = {
  /**
   * Canvas pixels across.
   */
  width: 1920,

  /**
   * Canvas pixels down.
   */
  height: 1080,
} as const;

/**
 * Where a box sits along one axis.
 */
type Side = 'start' | 'middle' | 'end';

/**
 * The side each anchor word names.
 */
const SIDES: Readonly<Record<'top' | 'bottom' | 'left' | 'right' | 'center', Side>> = {
  /**
   * The top edge.
   */
  top: 'start',

  /**
   * The bottom edge.
   */
  bottom: 'end',

  /**
   * The left edge.
   */
  left: 'start',

  /**
   * The right edge.
   */
  right: 'end',

  /**
   * The middle of the axis.
   */
  center: 'middle',
};

/**
 * Characters a React id has that a CSS `url(#id)` reference cannot.
 */
const NON_WORD = /\W/gu;

/**
 * The midpoint of a background image along either axis, in percent.
 */
const FOCAL_CENTER_PERCENT = 50;

/**
 * A slide's own background image with its defaults filled in.
 */
export type SlideImage = {
  /**
   * The image's URL.
   */
  url: string;

  /**
   * `cover` crops it to the slide around `focal`; `contain` shows all of it.
   */
  fit: 'cover' | 'contain';

  /**
   * The point kept in view when it is cropped, in percent.
   */
  focal: { x: number; y: number };

  /**
   * From 0 to 1.
   */
  opacity: number;

  /**
   * A role's color laid over it, if any.
   */
  tint: { role: string; opacity: number } | undefined;
};

/**
 * What a slide paints behind its content: the surface's layers it keeps and its own image.
 */
export type BackdropPlan = {
  /**
   * The surface's layers, each with its index in the brand's list; empty when the slide hides them.
   */
  layers: readonly { index: number; layer: BackgroundLayerTokens }[];

  /**
   * The slide's own image, painted above the layers it keeps.
   */
  image: SlideImage | undefined;
};

/**
 * Decides what a slide paints behind its content from its surface's layers and its `background:`:
 * nothing set keeps the layers; `none` hides them; an image replaces them, or paints over them with
 * `layers: over`. An image whose file was not found is left out (`deck lint` reports it as
 * `media-missing`), and the surface's layers stay hidden all the same, so the slide does not change
 * look when the file arrives.
 *
 * @param layers - The surface's resolved layers.
 * @param background - The slide's `background:`, if any.
 * @param resolve - Turns the path the slide writes into a URL, or `undefined` when it is missing.
 */
export function planBackdrop(
  layers: readonly BackgroundLayerTokens[],
  background: SlideBackground | undefined,
  resolve: (source: string) => string | undefined,
): BackdropPlan {
  const kept = layers.map((layer, index) => ({ index, layer }));
  if (background === undefined) {
    return { layers: kept, image: undefined };
  }

  if (background === 'none') {
    return { layers: [], image: undefined };
  }

  const options = typeof background === 'string' ? { src: background } : background;
  const url = resolve(options.src);
  return {
    layers: options.layers === 'over' ? kept : [],
    image:
      url === undefined
        ? undefined
        : {
            url,
            fit: options.fit ?? 'cover',
            focal: options.focal ?? { x: FOCAL_CENTER_PERCENT, y: FOCAL_CENTER_PERCENT },
            opacity: options.opacity ?? 1,
            tint: options.tint,
          },
  };
}

/**
 * Where a placed layer's box sits on the canvas, in canvas pixels: its anchor's corner, edge middle
 * or center, moved by its offset.
 *
 * @param layer - The placed layer.
 */
export function placedBox(layer: Extract<BackgroundLayerTokens, { type: 'placed' }>): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const width = layer.width;
  const height = width / layer.aspect;
  const [vertical, horizontal] = anchorSides(layer.anchor);
  return {
    left: along(horizontal, CANVAS.width, width) + layer.offset.x,
    top: along(vertical, CANVAS.height, height) + layer.offset.y,
    width,
    height,
  };
}

/**
 * Props of {@link Backdrop}.
 */
type BackdropProps = {
  /**
   * The layers to paint instead of the slide surface's own, such as a brand layout's artwork.
   */
  layers?: readonly BackgroundLayerTokens[] | undefined;
};

/**
 * The background a kit layout paints behind its content: the slide surface's image, pattern and
 * gradient layers from the brand, then the slide's own `background:` image. Decorative to every
 * tool: hidden from screen readers, ignored by the overflow and text rules, though `deck lint`
 * still measures text over its pictures against their pixels. Each layer is marked
 * `data-backdrop-layer` with its index in the surface's list (`slide` for the slide's own image),
 * which exports read. A layout with artwork of its own passes it as `layers`.
 */
export function Backdrop({ layers }: BackdropProps = {}): ReactNode {
  const { brand, surface } = useBrand();
  const { frontmatter, file } = useSlide();
  const plan = planBackdrop(layers ?? surface.layers, frontmatter.background, (source) =>
    frontmatterAsset(source, file),
  );
  if (plan.layers.length === 0 && plan.image === undefined) {
    return null;
  }

  return (
    <div className="kit-backdrop" data-backdrop="" aria-hidden="true" data-decorative="">
      {plan.layers.map(({ index, layer }) => (
        <BackdropLayer
          key={index}
          index={index}
          layer={layer}
          treatments={brand.imagery.treatments}
        />
      ))}
      {plan.image === undefined ? null : <SlideImageLayer image={plan.image} />}
    </div>
  );
}

/**
 * Props of {@link BackdropLayer}.
 */
type BackdropLayerProps = {
  /**
   * The layer's index in the surface's list.
   */
  index: number;

  /**
   * The layer.
   */
  layer: BackgroundLayerTokens;

  /**
   * The brand's image treatments, by name.
   */
  treatments: Readonly<Record<string, TreatmentTokens>>;
};

/**
 * One of the surface's layers.
 */
function BackdropLayer({ index, layer, treatments }: BackdropLayerProps): ReactNode {
  const marks = { 'data-backdrop-layer': String(index), 'data-backdrop-kind': layer.type };
  switch (layer.type) {
    case 'image': {
      const url = backgroundUrl(layer.file);
      if (url === undefined) {
        return null;
      }

      return (
        <TreatedImage
          marks={marks}
          url={url}
          fit={layer.fit}
          focal={layer.focal}
          opacity={layer.opacity}
          treatment={
            layer.treatment === undefined ? undefined : ownTreatment(treatments, layer.treatment)
          }
          tint={layer.tint}
        />
      );
    }

    case 'placed': {
      const url = backgroundUrl(layer.file);
      const box = placedBox(layer);
      if (url === undefined) {
        return null;
      }

      return (
        <img
          {...marks}
          className="kit-backdrop-placed"
          src={url}
          alt=""
          decoding="sync"
          style={{
            left: `${box.left}px`,
            top: `${box.top}px`,
            width: `${box.width}px`,
            height: `${box.height}px`,
            opacity: layer.opacity,
            ...(layer.rotate === 0 ? {} : { transform: `rotate(${layer.rotate}deg)` }),
          }}
        />
      );
    }

    case 'pattern': {
      const url = backgroundUrl(layer.file);
      if (url === undefined) {
        return null;
      }

      return (
        <div
          {...marks}
          className="kit-backdrop-fill"
          style={{
            backgroundImage: `url(${JSON.stringify(url)})`,
            backgroundSize: `${layer.tile}px ${layer.tile / layer.aspect}px`,
            backgroundPosition: `${layer.offset.x}px ${layer.offset.y}px`,
            backgroundRepeat: 'repeat',
            opacity: layer.opacity,
          }}
        />
      );
    }

    case 'gradient': {
      return (
        <div
          {...marks}
          className="kit-backdrop-fill"
          style={{ backgroundImage: layer.css, opacity: layer.opacity }}
        />
      );
    }
  }
}

/**
 * Props of {@link SlideImageLayer}.
 */
type SlideImageLayerProps = {
  /**
   * The slide's own image.
   */
  image: SlideImage;
};

/**
 * The slide's own background image, tinted with a role's color.
 */
function SlideImageLayer({ image }: SlideImageLayerProps): ReactNode {
  return (
    <TreatedImage
      marks={{ 'data-backdrop-layer': 'slide', 'data-backdrop-kind': 'image' }}
      url={image.url}
      fit={image.fit}
      focal={image.focal}
      opacity={image.opacity}
      treatment={undefined}
      tint={
        image.tint === undefined
          ? undefined
          : { color: `var(--brand-color-${image.tint.role})`, opacity: image.tint.opacity }
      }
    />
  );
}

/**
 * Props of {@link TreatedImage}.
 */
type TreatedImageProps = {
  /**
   * The data attributes that mark the layer.
   */
  marks: Readonly<Record<`data-${string}`, string>>;

  /**
   * The image's URL.
   */
  url: string;

  /**
   * How it fills the slide.
   */
  fit: 'cover' | 'contain';

  /**
   * The point kept in view, in percent.
   */
  focal: { x: number; y: number };

  /**
   * From 0 to 1.
   */
  opacity: number;

  /**
   * The brand treatment drawn on it, if any.
   */
  treatment: TreatmentTokens | undefined;

  /**
   * A color laid over it, if any: hex or a CSS variable.
   */
  tint: { color: string; opacity: number } | undefined;
};

/**
 * A full-slide image with a treatment's filter and tint, then its own tint over it.
 */
function TreatedImage({
  marks,
  url,
  fit,
  focal,
  opacity,
  treatment,
  tint,
}: TreatedImageProps): ReactNode {
  const plan = planTreatment(treatment);
  const filterId = `kit-backdrop-${useId().replaceAll(NON_WORD, '')}`;
  const filter = treatment === undefined ? 'none' : treatmentFilter(plan, filterId);
  const tints = [treatment === undefined ? undefined : plan.tint, tint].filter(
    (layer) => layer !== undefined,
  );
  return (
    <>
      <img
        {...marks}
        className="kit-backdrop-image"
        src={url}
        alt=""
        decoding="sync"
        style={{
          objectFit: fit,
          objectPosition: `${focal.x}% ${focal.y}%`,
          opacity,
          ...(filter === 'none' ? {} : { filter }),
        }}
      />
      {plan.duotone === undefined || treatment === undefined ? null : (
        <DuotoneFilter id={filterId} plan={plan.duotone} />
      )}
      {tints.map((layer, index) => (
        <div
          key={index}
          {...marks}
          data-backdrop-kind="tint"
          className="kit-backdrop-fill"
          style={{ background: layer.color, opacity: layer.opacity } satisfies CSSProperties}
        />
      ))}
    </>
  );
}

/**
 * The anchor's vertical and horizontal side: `start`, `middle` or `end`.
 *
 * @param anchor - The anchor, such as `bottom-right`, `top` or `center`.
 */
function anchorSides(anchor: string): [Side, Side] {
  const words = anchor.split('-');
  const vertical = words.find((word) => word === 'top' || word === 'bottom');
  const horizontal = words.find((word) => word === 'left' || word === 'right');
  return [SIDES[vertical ?? 'center'], SIDES[horizontal ?? 'center']];
}

/**
 * Where a box of a size starts along an axis of a length when it sits at one side or the middle.
 *
 * @param side - `start`, `middle` or `end`.
 * @param length - The axis length.
 * @param size - The box's size along it.
 */
function along(side: Side, length: number, size: number): number {
  if (side === 'start') {
    return 0;
  }

  return side === 'end' ? length - size : (length - size) / 2;
}

/**
 * A treatment by name, from the brand's own entries only.
 *
 * @param treatments - The brand's treatments.
 * @param name - The name a layer gives.
 */
function ownTreatment(
  treatments: Readonly<Record<string, TreatmentTokens>>,
  name: string,
): TreatmentTokens | undefined {
  return Object.hasOwn(treatments, name) ? treatments[name] : undefined;
}
