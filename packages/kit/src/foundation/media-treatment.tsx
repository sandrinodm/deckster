import { useBrand } from '@deckster/brand/runtime';
import { useId, type CSSProperties, type ReactNode } from 'react';

import { duotoneTables, planTreatment, type TreatmentPlan } from '#media/image-treatment.ts';
import { MediaFrameContext } from '#media/media-frame.ts';

/**
 * Characters a React id has that a CSS `url(#id)` reference cannot.
 */
const NON_WORD = /\W/gu;

/**
 * Custom properties a treated frame sets for the images and videos inside it.
 */
type TreatmentStyle = CSSProperties & Record<`--${string}`, string | number | undefined>;

/**
 * Props of {@link TreatedMedia}.
 */
type TreatedMediaProps = {
  /**
   * The element's classes, such as the layout's frame class.
   */
  className: string;

  /**
   * A treatment from the brand's `imagery.treatments`; the brand's default when left out.
   */
  treatment?: string;

  /**
   * Whether the frame keeps the treatment's rounded corners; `false` for media that bleeds to the
   * slide edges, whose corners are the slide's.
   */
  rounded?: boolean;

  /**
   * How an `Image` or `Video` inside that names no `fit` fills the frame; `cover` when left out.
   */
  fit?: 'cover' | 'contain';

  /**
   * The media: photos and videos placed directly in it get the treatment; components keep their own
   * look.
   */
  children?: ReactNode;
};

/**
 * A frame that draws the photos and videos placed directly in it (in a layout's media slot, say)
 * with one of the brand's image treatments: rounded corners on the frame, and grayscale, duotone or
 * a tint on the pictures, from the same plan the kit's `Image` uses. An `Image` or `Video` inside
 * it that names no treatment of its own takes the frame's, and its corners; other components (a
 * chart, a table) are left as they are.
 */
export function TreatedMedia({
  className,
  treatment,
  rounded = true,
  fit,
  children,
}: TreatedMediaProps): ReactNode {
  const { brand } = useBrand();
  const name = treatment ?? brand.imagery.default;
  const plan = planTreatment(brand.imagery.treatments[name]);
  const filterId = `kit-treatment-${useId().replaceAll(NON_WORD, '')}`;
  const style: TreatmentStyle = {
    '--kit-media-radius': rounded ? `${plan.radius}px` : '0px',
    '--kit-media-filter': treatmentFilter(plan, filterId),
    '--kit-media-tint': plan.tint?.color,
    '--kit-media-tint-opacity': plan.tint?.opacity,
  };
  return (
    <div
      className={`kit-treated ${className}`}
      data-treatment={name}
      data-tint={plan.tint !== undefined}
      style={style}>
      <MediaFrameContext value={{ treatment: name, rounded, fit }}>{children}</MediaFrameContext>
      {plan.duotone === undefined ? null : <DuotoneFilter id={filterId} plan={plan.duotone} />}
    </div>
  );
}

/**
 * Props of {@link DuotoneFilter}.
 */
export type DuotoneFilterProps = {
  /**
   * The filter id the pictures refer to.
   */
  id: string;

  /**
   * The duotone colors.
   */
  plan: NonNullable<TreatmentPlan['duotone']>;
};

/**
 * An SVG filter that maps a picture's brightness onto the two colors of a duotone: black becomes
 * the shadow color and white the highlight color.
 */
export function DuotoneFilter({ id, plan }: DuotoneFilterProps): ReactNode {
  const [red, green, blue] = duotoneTables(plan);
  return (
    <svg className="kit-treatment-filter" aria-hidden="true" data-decorative="" focusable="false">
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
export function treatmentFilter(plan: TreatmentPlan, filterId: string): string {
  if (plan.duotone !== undefined) {
    return `url(#${filterId})`;
  }

  return plan.grayscale ? 'grayscale(1)' : 'none';
}
