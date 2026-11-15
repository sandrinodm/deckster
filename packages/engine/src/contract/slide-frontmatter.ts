import { Effect, Schema } from 'effect';

import { deckCommand } from '#contract/deck-command.ts';
import { KebabName } from '#contract/kebab-name.ts';
import { BUDGET_PATTERN, DEFAULT_LAYOUT } from '#contract/slide-defaults.ts';

export { budgetSeconds, DEFAULT_LAYOUT, DEFAULT_SURFACE } from '#contract/slide-defaults.ts';

/**
 * The roles a slide's background image may be tinted with: colors every brand surface has.
 */
export const BACKGROUND_TINT_ROLES = ['bg', 'surface', 'fg', 'accent'] as const;

/**
 * A number from 0 to 1.
 */
const Fraction = Schema.Finite.check(
  Schema.isBetween({ minimum: 0, maximum: 1 }, { message: 'Expected a number from 0 to 1' }),
);

/**
 * A percentage from 0 to 100.
 */
const Percent = Schema.Finite.check(
  Schema.isBetween(
    { minimum: 0, maximum: 100 },
    { message: 'Expected a percentage from 0 to 100' },
  ),
);

/**
 * A slide's own background image, painted over its surface's color and gradient. `layers: replace`
 * (the default) hides the surface's background layers; `over` paints the image above them. The tint
 * names a role, not a color, so the slide looks right in every brand.
 */
const SlideBackgroundImage = Schema.Struct({
  src: Schema.NonEmptyString,
  fit: Schema.optionalKey(Schema.Literals(['cover', 'contain'])),
  focal: Schema.optionalKey(Schema.Struct({ x: Percent, y: Percent })),
  opacity: Schema.optionalKey(Fraction),
  tint: Schema.optionalKey(
    Schema.Struct({ role: Schema.Literals(BACKGROUND_TINT_ROLES), opacity: Fraction }),
  ),
  layers: Schema.optionalKey(Schema.Literals(['replace', 'over'])),
});

/**
 * A slide's `background:`: `none` to hide its surface's background layers, a path to an image, or
 * the image with its options.
 */
export const SlideBackground = Schema.Union([
  Schema.Literal('none'),
  Schema.NonEmptyString,
  SlideBackgroundImage,
]);

/**
 * A slide's decoded `background:`.
 */
export type SlideBackground = typeof SlideBackground.Type;

/**
 * The frontmatter every slide accepts, whether it comes from an MDX `---` block or a TSX `export
 * const frontmatter`. Decoding fills in `layout` with {@link DEFAULT_LAYOUT}. The layout a slide
 * names adds its own fields (its contract's `schema`); keys that neither define are rejected by the
 * build, so a misspelled key never passes silently.
 */
export const SlideFrontmatter = Schema.Struct({
  layout: KebabName('layout name').pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(DEFAULT_LAYOUT)),
  ),
  title: Schema.optionalKey(Schema.NonEmptyString),
  surface: Schema.optionalKey(KebabName('surface name')),
  background: Schema.optionalKey(SlideBackground),
  budget: Schema.optionalKey(
    Schema.String.check(
      Schema.isPattern(BUDGET_PATTERN, {
        message: 'Expected a duration such as "90s", "2m" or "1m30s"',
      }),
    ),
  ),
});

/**
 * Decoded slide frontmatter, with `layout` always present.
 */
export type SlideFrontmatter = typeof SlideFrontmatter.Type;

/**
 * Slide frontmatter as an author writes it; use with `satisfies` in TSX slides.
 */
export type SlideFrontmatterInput = typeof SlideFrontmatter.Encoded;

/**
 * How to fix each frontmatter field, appended to build errors that name the field. Keyed by field
 * name so the hint list cannot drift from the schema.
 */
export const SLIDE_FRONTMATTER_HINTS = {
  /**
   * Fix for a layout name that is not kebab-case.
   */
  layout:
    'Name a layout from `' +
    deckCommand() +
    ' layouts` in kebab-case, for example `layout: default`.',

  /**
   * Fix for a title that is empty or not text.
   */
  title: 'Write the slide title as text, for example `title: How a request reaches the model`.',

  /**
   * Fix for a surface name that is not kebab-case.
   */
  surface: 'Name a brand surface in kebab-case, for example `surface: inverse`.',

  /**
   * Fix for a background that is not `none`, a path or an image with its options.
   */
  background:
    "Write `background: none` to hide the surface's background layers, a path such as " +
    '`background: assets/hall.jpg`, or `background: { src: assets/hall.jpg, focal: { x: 30, y: ' +
    '50 }, tint: { role: bg, opacity: 0.6 } }`.',

  /**
   * Fix for a budget that is not minutes and seconds.
   */
  budget: 'Write the speaking time as minutes and seconds, for example `budget: 90s` or `1m30s`.',
} satisfies Record<keyof SlideFrontmatterInput, string>;
