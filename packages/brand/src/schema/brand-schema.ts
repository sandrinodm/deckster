import { Schema } from 'effect';

import { BrandCharts } from '#schema/charts-schema.ts';
import { BrandColor } from '#schema/color-schema.ts';
import { BrandDiagram } from '#schema/diagram-schema.ts';
import { BrandGradients } from '#schema/gradient-schema.ts';
import { BrandIcons, BrandImagery, BrandLogo } from '#schema/identity-schema.ts';
import { BrandChrome, BrandMotion } from '#schema/presentation-schema.ts';
import { KebabName } from '#schema/primitives.ts';
import { BrandShape, BrandSpacing } from '#schema/shape-schema.ts';
import { BrandCode } from '#schema/theme-schema.ts';
import { BrandTypography } from '#schema/typography-schema.ts';

/**
 * The brand a deck uses when its `deck.config.ts` names none.
 */
export const DEFAULT_BRAND = 'default';

/**
 * Everything a brand defines, as validated from `brands/<name>/brand.ts`. `name` must match the
 * folder name. `code` and `diagram` are optional overrides; without them both themes are derived
 * from each surface's roles, and `diagram` also sets the look of edges, groups and labels and the
 * brand's node cards. `charts` is optional too and defaults from the roles and type scale.
 */
export const Brand = Schema.Struct({
  name: KebabName('brand name', 'acme'),
  label: Schema.NonEmptyString,
  color: BrandColor,
  gradients: BrandGradients,
  typography: BrandTypography,
  shape: BrandShape,
  spacing: BrandSpacing,
  logo: BrandLogo,
  icons: BrandIcons,
  imagery: BrandImagery,
  chrome: BrandChrome,
  motion: BrandMotion,
  code: Schema.optionalKey(BrandCode),
  diagram: Schema.optionalKey(BrandDiagram),
  charts: Schema.optionalKey(BrandCharts),
});

/**
 * A decoded brand.
 */
export type Brand = typeof Brand.Type;

/**
 * A brand as written in `brand.ts`.
 */
export type BrandInput = typeof Brand.Encoded;

/**
 * Declares a brand in `brands/<name>/brand.ts`. It returns its argument unchanged and exists for
 * type checking; the build validates the brand and fails with errors that name the field and the
 * fix, including contrast and color-vision problems.
 *
 * @param brand - The brand's tokens.
 * @returns The same brand, typed.
 */
export function defineBrand(brand: BrandInput): BrandInput {
  return brand;
}
