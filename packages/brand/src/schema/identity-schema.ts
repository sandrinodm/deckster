import { Schema } from 'effect';

import { ColorRef, Corner, KebabName, Opacity, Pixels } from '#schema/primitives.ts';
import { RADIUS_NAMES } from '#schema/shape-schema.ts';

/**
 * Logo files are SVG or raster images inside the brand folder.
 */
const LOGO_FILE_PATTERN = /^(?!\/)(?!.*\.\.)[\w./-]+\.(?:svg|png|webp)$/;

/**
 * Iconify collection prefixes: `lucide`, `ph`, `tabler`.
 */
const ICON_SET_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The widest logo, as width divided by height.
 */
const MAX_LOGO_ASPECT = 50;

/**
 * The most clear space around a logo, in multiples of its height.
 */
const MAX_CLEAR_SPACE = 10;

/**
 * One logo file and its width divided by its height.
 */
const LogoVariant = Schema.Struct({
  /**
   * Path inside the brand folder, such as `logos/wordmark.svg`.
   */
  file: Schema.String.check(
    Schema.isPattern(LOGO_FILE_PATTERN, {
      message: 'Expected a path inside the brand folder such as "logos/wordmark.svg"',
    }),
  ),
  /**
   * Width divided by height, used to reserve space before the image loads.
   */
  aspect: Schema.Finite.check(
    Schema.isGreaterThan(0, { message: 'Expected the width divided by the height, such as 4.2' }),
    Schema.isLessThanOrEqualTo(MAX_LOGO_ASPECT, {
      message: `Expected the width divided by the height, at most ${MAX_LOGO_ASPECT}`,
    }),
  ),
});

/**
 * The `logo` section: named variants (such as `primary` and `reversed`), the default variant
 * (surfaces pick another with their `logo` field), clear space as a multiple of the logo height,
 * and where chrome places it.
 */
export const BrandLogo = Schema.Struct({
  variants: Schema.Record(KebabName('logo variant', 'reversed'), LogoVariant),
  default: KebabName('logo variant', 'primary'),
  clearSpace: Schema.Finite.check(
    Schema.isBetween(
      { minimum: 0, maximum: MAX_CLEAR_SPACE },
      { message: `Expected a multiple of the logo height, from 0 to ${MAX_CLEAR_SPACE}` },
    ),
  ),
  placement: Schema.Struct({ corner: Corner, height: Pixels }),
});

/**
 * The `icons` section: an Iconify collection and the stroke width to draw it at.
 */
export const BrandIcons = Schema.Struct({
  set: Schema.String.check(
    Schema.isPattern(ICON_SET_PATTERN, {
      message: 'Expected an Iconify collection such as "lucide"',
    }),
  ),
  strokeWidth: Schema.Finite.check(
    Schema.isBetween(
      { minimum: 0.5, maximum: 4 },
      { message: 'Expected a stroke width from 0.5 to 4' },
    ),
  ),
});

/**
 * An image treatment, told apart by its `type`.
 */
const Treatment = Schema.Union([
  Schema.Struct({ type: Schema.Literal('none') }),
  Schema.Struct({ type: Schema.Literal('rounded'), radius: Schema.Literals(RADIUS_NAMES) }),
  Schema.Struct({ type: Schema.Literal('grayscale') }),
  Schema.Struct({ type: Schema.Literal('duotone'), shadow: ColorRef, highlight: ColorRef }),
  Schema.Struct({ type: Schema.Literal('tint'), color: ColorRef, opacity: Opacity }),
]).annotate({
  message:
    'Expected an image treatment whose type is "none", "rounded", "grayscale", "duotone" or "tint"',
});

/**
 * A decoded image treatment.
 */
export type Treatment = typeof Treatment.Type;

/**
 * The treatment every brand has, which draws a picture as it is: no corners, filter or tint. A
 * slide names it for a picture whose own colors carry meaning (a product screenshot, a map, a
 * chart), so it works whatever the brand. A brand need not define it; one that does must define it
 * as `{ type: 'none' }`.
 */
export const PLAIN_TREATMENT = 'plain';

/**
 * A brand's treatments with {@link PLAIN_TREATMENT} added when the brand does not define it.
 *
 * @param treatments - The treatments the brand defines, as written or resolved.
 * @param plain - The untreated treatment in the same form, `{ type: 'none' }`.
 * @returns The same treatments, with `plain` added if it was missing.
 */
export function withPlainTreatment<Value>(
  treatments: Readonly<Record<string, Value>>,
  plain: Value,
): Readonly<Record<string, Value>> {
  return Object.hasOwn(treatments, PLAIN_TREATMENT)
    ? treatments
    : { ...treatments, [PLAIN_TREATMENT]: plain };
}

/**
 * The `imagery` section: named image treatments and the one images get by default.
 */
export const BrandImagery = Schema.Struct({
  treatments: Schema.Record(KebabName('treatment name', 'duotone'), Treatment),
  default: KebabName('treatment name', 'rounded'),
});
