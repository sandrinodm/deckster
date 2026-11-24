import { SLOT_NAME_PATTERN } from '@deckster/engine/slots';
import { Schema } from 'effect';

import { BackgroundLayers } from '#schema/background-schema.ts';
import { ROLE_NAMES } from '#schema/color-schema.ts';
import { KebabName } from '#schema/primitives.ts';
import { TYPE_STEPS } from '#schema/typography-schema.ts';

/**
 * The file in a brand folder that holds the brand's layouts, next to `brand.ts`.
 */
export const LAYOUTS_FILE = 'layouts.ts';

/**
 * The most layouts one `layouts.ts` holds; a template with more is several brands.
 */
export const MAX_BRAND_LAYOUTS = 64;

/**
 * The most regions one layout places.
 */
export const MAX_LAYOUT_REGIONS = 12;

/**
 * The slide's width in canvas pixels.
 */
export const LAYOUT_CANVAS_WIDTH = 1920;

/**
 * The slide's height in canvas pixels.
 */
export const LAYOUT_CANVAS_HEIGHT = 1080;

/**
 * The smallest width or height of a region, in canvas pixels.
 */
export const MIN_BOX_SIZE_PX = 40;

/**
 * The most words, bullets or lines a budget may allow.
 */
const MAX_BUDGET = 10_000;

/**
 * Names a field a frontmatter key can have: lowerCamel, as `eyebrow` or `byline`.
 */
const FIELD_NAME_PATTERN = /^[a-z][a-zA-Z0-9]*$/;

/**
 * A key of `source.placeholders`: `title`, `slot:<name>` or `field:<name>`.
 */
const PLACEHOLDER_KEY_PATTERN = /^(?:title|slot:[a-z][a-zA-Z0-9]*|field:[a-z][a-zA-Z0-9]*)$/;

/**
 * Where a box sits: `[x, y, width, height]` in canvas pixels on the 1920x1080 canvas.
 */
const LayoutBoxSchema = Schema.Tuple([
  Schema.Finite,
  Schema.Finite,
  Schema.Finite,
  Schema.Finite,
]).annotate({
  message: 'Expected a box as [x, y, width, height] in canvas pixels, such as [120, 200, 800, 400]',
});

/**
 * A box as `[x, y, width, height]` in canvas pixels.
 */
export type LayoutBox = typeof LayoutBoxSchema.Type;

/**
 * Horizontal alignment values for text in its box.
 */
export const REGION_ALIGNS = ['start', 'center', 'end'] as const;

/**
 * Horizontal alignment of text in its box.
 */
export type RegionAlign = (typeof REGION_ALIGNS)[number];

/**
 * Vertical placement values for text in its box.
 */
export const REGION_ANCHORS = ['start', 'center', 'end'] as const;

/**
 * Vertical placement of text in its box.
 */
export type RegionAnchor = (typeof REGION_ANCHORS)[number];

/**
 * Horizontal alignment of text in its box.
 */
const RegionAlignSchema = Schema.Literals(REGION_ALIGNS);

/**
 * Vertical placement of text in its box.
 */
const RegionAnchorSchema = Schema.Literals(REGION_ANCHORS);

/**
 * A type step from the brand's scale.
 */
const TypeStepName = Schema.Literals(TYPE_STEPS);

/**
 * A color role.
 */
const RoleName = Schema.Literals(ROLE_NAMES);

/**
 * A slot name of a layout: camelCase, as the engine names slots, such as `body` or `quoteSource`.
 */
const SlotName = Schema.String.check(
  Schema.isPattern(SLOT_NAME_PATTERN, {
    message: 'Expected a slot name in camelCase, such as "body" or "quoteSource"',
  }),
);

/**
 * A frontmatter field name: lowerCamel, as `eyebrow` or `byline`.
 */
const FieldName = Schema.String.check(
  Schema.isPattern(FIELD_NAME_PATTERN, {
    message: 'Expected a frontmatter field name in lowerCamelCase, such as "eyebrow"',
  }),
);

/**
 * What a region shows: the layout's slot of that name, or a frontmatter field of that name.
 */
const RegionBinding = Schema.Union([
  Schema.Struct({ slot: SlotName }),
  Schema.Struct({ field: FieldName }),
]).annotate({
  message: 'Expected `{ slot: "body" }` to show a slot, or `{ field: "eyebrow" }` for a field',
});

/**
 * One placed region of a layout.
 */
const BrandLayoutRegion = Schema.Struct({
  bind: RegionBinding,
  box: LayoutBoxSchema,
  kind: Schema.optionalKey(Schema.Literals(['text', 'media', 'content'])),
  type: Schema.optionalKey(TypeStepName),
  align: Schema.optionalKey(RegionAlignSchema),
  anchor: Schema.optionalKey(RegionAnchorSchema),
  color: Schema.optionalKey(RoleName),
  fit: Schema.optionalKey(Schema.Literals(['cover', 'contain'])),
  treatment: Schema.optionalKey(KebabName('treatment name', 'duotone')),
});

/**
 * The slide title's place and look.
 */
const BrandLayoutTitle = Schema.Struct({
  box: LayoutBoxSchema,
  type: Schema.optionalKey(TypeStepName),
  align: Schema.optionalKey(RegionAlignSchema),
  anchor: Schema.optionalKey(RegionAnchorSchema),
  color: Schema.optionalKey(RoleName),
});

/**
 * Which chrome a layout keeps, hides or moves.
 */
const BrandLayoutChrome = Schema.Struct({
  pageNumber: Schema.optionalKey(Schema.Union([Schema.Boolean, LayoutBoxSchema])),
  footer: Schema.optionalKey(Schema.Boolean),
  progress: Schema.optionalKey(Schema.Boolean),
  logo: Schema.optionalKey(Schema.Boolean),
});

/**
 * How much a slot holds before the slide is too full.
 */
const SlotBudget = Schema.Struct({
  maxWords: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: MAX_BUDGET })),
  ),
  maxBullets: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: MAX_BUDGET })),
  ),
  maxLines: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: MAX_BUDGET })),
  ),
});

/**
 * Where a layout came from in the source template.
 */
const LayoutSource = Schema.Struct({
  file: Schema.NonEmptyString,
  master: Schema.optionalKey(Schema.Int),
  layout: Schema.optionalKey(Schema.String),
  placeholders: Schema.optionalKey(
    Schema.Record(
      Schema.String.check(
        Schema.isPattern(PLACEHOLDER_KEY_PATTERN, {
          message: 'Expected "title", "slot:<name>" or "field:<name>"',
        }),
      ),
      Schema.Int,
    ),
  ),
});

/**
 * A layout's own art: one list for every surface, or one list per surface name.
 */
const LayoutBackground = Schema.Union([
  BackgroundLayers,
  Schema.Record(KebabName('surface name', 'inverse'), BackgroundLayers),
]);

/**
 * One layout a brand brings: a name, the kit layout it falls back to, where its title and slots sit
 * on the 1920x1080 canvas and the art behind them.
 */
export const BrandLayoutSpec = Schema.Struct({
  name: KebabName('layout name', 'section-photo'),
  label: Schema.optionalKey(Schema.String),
  description: Schema.NonEmptyString,
  fallback: KebabName('kit layout name', 'title'),
  surface: Schema.optionalKey(KebabName('surface name', 'inverse')),
  title: Schema.Union([BrandLayoutTitle, Schema.Literal(false)]).annotate({
    message: 'Expected `{ box: [x, y, width, height] }` for the title, or `false` for none',
  }),
  regions: Schema.Array(BrandLayoutRegion).check(
    Schema.isMaxLength(MAX_LAYOUT_REGIONS, {
      message: `Expected at most ${MAX_LAYOUT_REGIONS} regions`,
    }),
  ),
  background: Schema.optionalKey(LayoutBackground),
  layers: Schema.optionalKey(Schema.Literals(['replace', 'over'])),
  chrome: Schema.optionalKey(BrandLayoutChrome),
  fields: Schema.optionalKey(Schema.Array(FieldName)),
  budget: Schema.optionalKey(Schema.Record(SlotName, SlotBudget)),
  source: Schema.optionalKey(LayoutSource),
});

/**
 * A decoded layout spec.
 */
export type BrandLayoutSpec = typeof BrandLayoutSpec.Type;

/**
 * A layout as written in `layouts.ts`.
 */
export type BrandLayoutSpecInput = typeof BrandLayoutSpec.Encoded;

/**
 * Everything `layouts.ts` exports: at most {@link MAX_BRAND_LAYOUTS} layouts.
 */
export const BrandLayouts = Schema.Array(BrandLayoutSpec).check(
  Schema.isMaxLength(MAX_BRAND_LAYOUTS, {
    message: `Expected at most ${MAX_BRAND_LAYOUTS} layouts in a file`,
  }),
);

/**
 * Declares a brand's layouts in `brands/<name>/layouts.ts`. It returns its argument unchanged and
 * exists for type checking; the build validates the layouts and fails with errors that name the
 * field and the fix.
 *
 * @param layouts - The brand's layouts.
 * @returns The same layouts, typed.
 */
export function defineBrandLayouts(
  layouts: readonly BrandLayoutSpecInput[],
): readonly BrandLayoutSpecInput[] {
  return layouts;
}
