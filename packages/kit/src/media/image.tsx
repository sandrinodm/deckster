import { useBrand } from '@deckster/brand/runtime';
import { useId, useRef, type CSSProperties, type ReactNode } from 'react';

import type { FocalPoint } from '#media/focal-point.ts';

import { checkComponentProps } from '#components/check-component-props.ts';
import { focalStyle } from '#media/focal-point.ts';
import { duotoneTables, planTreatment } from '#media/image-treatment.ts';
import { useMediaFrame } from '#media/media-frame.ts';
import { useImageStatus } from '#media/use-media-ready.ts';

/**
 * Characters an element id may not contain in a `url(#id)` reference.
 */
const NON_WORD = /\W/g;

/**
 * Props of {@link Image}.
 */
export type ImageProps = {
  /**
   * The image file. In MDX a relative path such as `../assets/street.jpg` is resolved at build
   * time: the file is fingerprinted, and a path that does not exist is a build warning. Imported
   * files and URLs work too.
   */
  src: string;

  /**
   * What the image shows, for people who cannot see it. Use `''` only for pure decoration.
   */
  alt: string;

  /**
   * The name of a treatment in the brand's `imagery.treatments`, such as `duotone` or `rounded`;
   * `plain`, which every brand has, shows the image as it is. Defaults to the slide's `treatment`
   * in a layout's media slot, else the brand's default treatment.
   */
  treatment?: string;

  /**
   * How the image fills its frame: `cover` (the default) crops to fill, `contain` shows all of it.
   */
  fit?: 'cover' | 'contain';

  /**
   * The subject's position, so cropping keeps it in view: `'top left'`, `'50% 20%'` or `[30, 20]`.
   */
  focal?: FocalPoint;

  /**
   * The frame's width over height, such as `16 / 9`: the figure keeps that shape in any container
   * (a layout's media frame fits the largest such box in), so corners, a tint and a `<Morph>` hold
   * it. Without it the frame takes the room its container gives it, or the image's own shape.
   */
  ratio?: number;

  /**
   * A caption under the image.
   */
  caption?: ReactNode;
};

/**
 * An image drawn with one of the brand's treatments (rounded corners, grayscale, duotone, tint or
 * none), cropped to its frame with `fit` and a focal point, and captioned. The slide's `ready()` is
 * held until the image has decoded. A missing file shows a labelled placeholder rather than a
 * broken-image icon.
 *
 * ```mdx
 * <Image
 *   src="../assets/street.jpg"
 *   alt="A street under maple trees"
 *   focal="top"
 *   caption="Westgate, July"
 * />
 * ```
 */
export function Image(props: ImageProps): ReactNode {
  checkComponentProps('Image', props);
  const { src, alt, treatment, fit = 'cover', focal, ratio, caption } = props;
  const { brand } = useBrand();
  const frame = useMediaFrame();
  const name = treatment ?? frame?.treatment ?? brand.imagery.default;
  const plan = planTreatment(brand.imagery.treatments[name]);
  const filterId = `kit-duotone-${useId().replaceAll(NON_WORD, '')}`;
  const ref = useRef<HTMLImageElement | null>(null);
  const status = useImageStatus(ref, src);
  const frameStyle: CSSProperties & Record<`--${string}`, string | number | undefined> = {
    borderRadius: frame?.rounded === false ? 0 : plan.radius,
    aspectRatio: ratio,
    '--kit-image-tint': plan.tint?.color,
    '--kit-image-tint-opacity': plan.tint?.opacity,
  };
  const imageStyle: CSSProperties = {
    objectFit: fit,
    ...focalStyle(focal),
    filter: filterOf(plan, filterId),
  };
  return (
    <figure
      className="kit-image"
      data-treatment={name}
      data-status={status}
      data-ratio={ratio === undefined ? undefined : ''}
      style={ratio === undefined ? undefined : ratioStyle(ratio)}>
      <div className="kit-image-frame" data-tint={plan.tint !== undefined} style={frameStyle}>
        {status === 'error' ? (
          <div className="kit-image-missing kit-type-caption">Image not found: {src}</div>
        ) : null}
        <img
          ref={ref}
          src={src}
          alt={alt}
          style={imageStyle}
          draggable={false}
          hidden={status === 'error'}
        />
        {plan.duotone === undefined ? null : <DuotoneFilter id={filterId} plan={plan.duotone} />}
      </div>
      {caption === undefined ? null : (
        <figcaption className="kit-image-caption kit-type-caption">{caption}</figcaption>
      )}
    </figure>
  );
}

/**
 * The custom property a layout reads to fit a figure of a stated ratio into its frame.
 *
 * @param ratio - The frame's width over height.
 */
function ratioStyle(ratio: number): CSSProperties & Record<`--${string}`, number> {
  return { '--kit-image-ratio': ratio };
}

/**
 * Props of {@link DuotoneFilter}.
 */
type DuotoneFilterProps = {
  /**
   * The filter id the image refers to.
   */
  id: string;

  /**
   * The duotone colors.
   */
  plan: NonNullable<ReturnType<typeof planTreatment>['duotone']>;
};

/**
 * An SVG filter that maps an image's brightness onto the two colors of a duotone: black becomes the
 * shadow color and white the highlight color.
 */
function DuotoneFilter({ id, plan }: DuotoneFilterProps): ReactNode {
  const [red, green, blue] = duotoneTables(plan);
  return (
    <svg className="kit-image-filter" aria-hidden="true" data-decorative="" focusable="false">
      <filter id={id} colorInterpolationFilters="sRGB">
        <feColorMatrix type="saturate" values="0" />
        <feComponentTransfer>
          <feFuncR type="table" tableValues={red} />
          <feFuncG type="table" tableValues={green} />
          <feFuncB type="table" tableValues={blue} />
        </feComponentTransfer>
      </filter>
    </svg>
  );
}

/**
 * The CSS `filter` for a plan: a duotone, grayscale, or none.
 *
 * @param plan - The treatment plan.
 * @param filterId - The id of the duotone filter.
 */
function filterOf(plan: ReturnType<typeof planTreatment>, filterId: string): string | undefined {
  if (plan.duotone !== undefined) {
    return `url(#${filterId})`;
  }

  return plan.grayscale ? 'grayscale(1)' : undefined;
}
