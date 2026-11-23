import { Schema } from 'effect';

import { isUnicodeRange } from '#compile/css-syntax.ts';
import { FiniteBetween, Pixels } from '#schema/primitives.ts';

/**
 * The three family roles a brand provides. Type steps pick one of them.
 */
export const FAMILY_ROLES = ['display', 'body', 'mono'] as const;

/**
 * A font family role.
 */
export type FamilyRole = (typeof FAMILY_ROLES)[number];

/**
 * The type steps every brand defines. Names are fixed so layouts can rely on them in every brand;
 * each becomes a `type-<step>` Tailwind utility. Intended uses: `display` for title and statement
 * slides, `headline` for slide titles, `title` for card and column titles, `lead` for the paragraph
 * under a title, `body` for running text and bullets, `small` for dense text and table cells,
 * `caption` for figure captions, sources and the label under a stat, `label` for eyebrows,
 * overlines, kickers and chrome, `stat` for big numbers, `quote` for pull quotes and `code` for
 * code blocks.
 */
export const TYPE_STEPS = [
  'display',
  'headline',
  'title',
  'lead',
  'body',
  'small',
  'caption',
  'label',
  'stat',
  'quote',
  'code',
] as const;

/**
 * A type step name.
 */
export type TypeStep = (typeof TYPE_STEPS)[number];

/**
 * Smallest type size allowed, in canvas pixels (the canvas is 1920x1080): about 1.9% of the slide
 * height, the smallest text that stays readable from the back of a room. The schema rejects type
 * steps below it and `deckster lint` flags rendered text below it, so both use this one number.
 */
export const MIN_TYPE_SIZE_PX = 20;

/**
 * WCAG's large text in canvas pixels (18pt): text this size or larger needs only 3:1 contrast.
 */
export const LARGE_TEXT_PX = 24;

/**
 * WCAG's large text in canvas pixels for bold text (14pt at {@link BOLD_WEIGHT} or heavier).
 */
export const LARGE_BOLD_TEXT_PX = 18.66;

/**
 * The weight from which WCAG counts text as bold.
 */
export const BOLD_WEIGHT = 700;

/**
 * Generic CSS families, one of which must end every fallback stack.
 */
export const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
]);

/**
 * Characters a family name may hold: letters, combining marks, digits, spaces and `-_.'&+`. Names
 * reach CSS strings, PowerPoint XML and file names, so quotes, backslashes, brackets, semicolons,
 * angle brackets and control characters are refused at the schema, before any of them is written.
 */
const FAMILY_NAME_PATTERN = /^[\p{L}\p{M}\p{N}-][\p{L}\p{M}\p{N} \-_.'&+]*$/u;

/**
 * The longest family name.
 */
const MAX_FAMILY_NAME_LENGTH = 100;

/**
 * An OpenType feature or variation axis tag: four letters, digits or trailing spaces, such as
 * `tnum`, `ss01` or `wght`.
 */
const OPENTYPE_TAG_PATTERN = /^[A-Za-z0-9]{1,4} {0,3}$/;

/**
 * The exact length of an OpenType tag.
 */
const OPENTYPE_TAG_LENGTH = 4;

/**
 * The range variation axis values are held to; real axes (`wght`, `opsz`, `wdth`, `GRAD`) sit well
 * inside it.
 */
const MAX_AXIS_VALUE = 1000;

/**
 * A font file in the brand folder: a relative path of letters, digits, `_`, `.`, `/` and `-`, not
 * starting with `/` or containing `..`, ending in a font extension.
 */
const FONT_FILE_PATTERN = /^(?!\/)(?!.*\.\.)(?!.*\/\/)[\w./-]+\.(?:woff2|woff|ttf|otf)$/;

/**
 * A Fontsource subset name such as `latin` or `latin-ext`.
 */
const SUBSET_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * A Fontsource variable file set such as `wght`, `standard` or `full`.
 */
const AXES_SET_PATTERN = /^[a-z0-9]+$/;

/**
 * A font family name, from {@link FAMILY_NAME_PATTERN}.
 */
const FamilyName = Schema.String.check(
  Schema.makeFilter(
    (name: string) => name.length <= MAX_FAMILY_NAME_LENGTH && FAMILY_NAME_PATTERN.test(name),
    {
      message:
        "Expected a family name of letters, digits, spaces and - _ . ' & + " +
        `(at most ${MAX_FAMILY_NAME_LENGTH} characters), such as "IBM Plex Sans"`,
    },
  ),
);

/**
 * An OpenType tag, from {@link OPENTYPE_TAG_PATTERN}.
 */
const OpenTypeTag = Schema.String.check(
  Schema.makeFilter(
    (tag: string) => tag.length === OPENTYPE_TAG_LENGTH && OPENTYPE_TAG_PATTERN.test(tag),
    { message: 'Expected a four-character OpenType tag such as "tnum", "ss01" or "wght"' },
  ),
);

/**
 * The font styles a face can have.
 */
const FontStyle = Schema.Literals(['normal', 'italic']);

/**
 * A font weight on the CSS scale, from 1 to 1000.
 */
const FontWeight = Schema.Finite.check(
  Schema.isBetween(
    { minimum: 1, maximum: 1000 },
    { message: 'Expected a font weight from 1 to 1000' },
  ),
);

/**
 * A font from a Fontsource package installed in the brand's `package.json`. Variable packages
 * (`@fontsource-variable/*`) load the `axes` file set (default `wght`); static packages load the
 * listed `weights`.
 */
const FontsourceSource = Schema.Struct({
  kind: Schema.Literal('fontsource'),
  package: Schema.String.check(
    Schema.isPattern(/^@fontsource(?:-variable)?\/[a-z0-9-]+$/, {
      message: 'Expected a Fontsource package such as "@fontsource-variable/inter"',
    }),
  ),
  axes: Schema.optionalKey(
    Schema.String.check(
      Schema.isPattern(AXES_SET_PATTERN, {
        message: 'Expected a Fontsource file set such as "wght", "standard" or "full"',
      }),
    ),
  ),
  weights: Schema.optionalKey(Schema.Array(FontWeight)),
  styles: Schema.optionalKey(Schema.Array(FontStyle)),
  subsets: Schema.optionalKey(
    Schema.Array(
      Schema.String.check(
        Schema.isPattern(SUBSET_PATTERN, {
          message: 'Expected a Fontsource subset such as "latin" or "latin-ext"',
        }),
      ),
    ),
  ),
});

/**
 * A font file in the brand folder, such as `fonts/acme-sans-bold.woff2`.
 */
const FontFile = Schema.Struct({
  path: Schema.String.check(
    Schema.isPattern(FONT_FILE_PATTERN, {
      message:
        'Expected a path inside the brand folder ending in .woff2, .woff, .ttf or .otf, ' +
        'such as "fonts/acme-sans.woff2"',
    }),
  ),
  weight: Schema.Union([FontWeight, Schema.Tuple([FontWeight, FontWeight])]),
  style: Schema.optionalKey(FontStyle),
  unicodeRange: Schema.optionalKey(
    Schema.String.check(
      Schema.makeFilter((range: string) => isUnicodeRange(range), {
        message: 'Expected a CSS unicode-range such as "U+0000-00FF, U+0131"',
      }),
    ),
  ),
});

/**
 * Font files the brand ships in its own folder, at least one.
 */
const FilesSource = Schema.Struct({
  kind: Schema.Literal('files'),
  files: Schema.Array(FontFile).check(
    Schema.isMinLength(1, { message: 'Expected at least one font file' }),
  ),
});

/**
 * A font the viewer's system provides; nothing is loaded.
 */
const SystemSource = Schema.Struct({ kind: Schema.Literal('system') });

/**
 * A font the brand uses but cannot ship, such as a commercial face whose files have not been
 * supplied. Nothing is loaded, text renders in the fallback stack, and every build warns with the
 * reason until the files are added (as `kind: "files"`).
 */
const UnavailableSource = Schema.Struct({
  kind: Schema.Literal('unavailable'),
  reason: Schema.NonEmptyString,
});

/**
 * Where a family's font files come from, told apart by its `kind`.
 */
const FontSource = Schema.Union([
  FontsourceSource,
  FilesSource,
  SystemSource,
  UnavailableSource,
]).annotate({
  message: 'Expected a font source whose kind is "fontsource", "files", "system" or "unavailable"',
});

/**
 * A byte of a font's OS/2 metadata, such as `pitchFamily` or `charset`.
 */
const FontByte = Schema.Int.check(
  Schema.isBetween(
    { minimum: 0, maximum: 255 },
    { message: 'Expected a whole number from 0 to 255' },
  ),
);

/**
 * The installed family exported documents (PowerPoint, Keynote, Google Slides) name as the family's
 * stand-in where the brand font is neither embedded nor installed, so apps substitute sans for
 * sans, serif for serif and mono for mono instead of Times. `panose` (20 hex digits, the OS/2
 * PANOSE bytes), `pitchFamily` and `charset` are the values PowerPoint writes on `a:latin`; they
 * default to the known values of common families.
 */
export const FontSubstitute = Schema.Struct({
  family: FamilyName,
  panose: Schema.optionalKey(
    Schema.String.check(
      Schema.isPattern(/^[0-9A-Fa-f]{20}$/, {
        message: 'Expected 20 hex digits, the ten PANOSE bytes, such as "020B0604020202020204"',
      }),
    ),
  ),
  pitchFamily: Schema.optionalKey(FontByte),
  charset: Schema.optionalKey(FontByte),
});

/**
 * A decoded font substitute.
 */
export type FontSubstitute = typeof FontSubstitute.Type;

/**
 * A family: the CSS family name, its fallbacks (ending in a generic family), its source, and the
 * installed family exported documents fall back to.
 */
const FontFamily = Schema.Struct({
  family: FamilyName,
  fallback: Schema.Array(FamilyName),
  source: FontSource,
  substitute: Schema.optionalKey(FontSubstitute),
});

/**
 * One step of the type scale. Sizes are canvas pixels, tracking is in em.
 */
const TypeStepSpec = Schema.Struct({
  family: Schema.Literals(FAMILY_ROLES),
  size: Pixels.check(
    Schema.isGreaterThanOrEqualTo(MIN_TYPE_SIZE_PX, {
      message: `Expected a size of at least ${MIN_TYPE_SIZE_PX} canvas pixels`,
    }),
  ),
  lineHeight: Schema.Finite.check(
    Schema.isBetween(
      { minimum: 0.7, maximum: 2.5 },
      { message: 'Expected a unitless line height from 0.7 to 2.5' },
    ),
  ),
  tracking: Schema.Finite.check(
    Schema.isBetween(
      { minimum: -0.1, maximum: 0.5 },
      { message: 'Expected tracking in em from -0.1 to 0.5' },
    ),
  ),
  weight: FontWeight,
  case: Schema.optionalKey(Schema.Literals(['none', 'upper'])),
  style: Schema.optionalKey(FontStyle),
  /**
   * OpenType features such as `tnum` or `ss01`.
   */
  features: Schema.optionalKey(Schema.Array(OpenTypeTag)),
  /**
   * Variable font axes such as `{ opsz: 144, SOFT: 100 }`.
   */
  axes: Schema.optionalKey(
    Schema.Record(
      OpenTypeTag,
      FiniteBetween(
        -MAX_AXIS_VALUE,
        MAX_AXIS_VALUE,
        `Expected an axis value from -${MAX_AXIS_VALUE} to ${MAX_AXIS_VALUE}`,
      ),
    ),
  ),
});

/**
 * A decoded type step.
 */
export type TypeStepSpec = typeof TypeStepSpec.Type;

/**
 * Every step in {@link TYPE_STEPS}; the `satisfies` keeps the two lists in step.
 */
const TypeScale = Schema.Struct({
  display: TypeStepSpec,
  headline: TypeStepSpec,
  title: TypeStepSpec,
  lead: TypeStepSpec,
  body: TypeStepSpec,
  small: TypeStepSpec,
  caption: TypeStepSpec,
  label: TypeStepSpec,
  stat: TypeStepSpec,
  quote: TypeStepSpec,
  code: TypeStepSpec,
} satisfies Record<TypeStep, typeof TypeStepSpec>);

/**
 * The `typography` section of a brand.
 */
export const BrandTypography = Schema.Struct({
  families: Schema.Struct({ display: FontFamily, body: FontFamily, mono: FontFamily }),
  scale: TypeScale,
});

/**
 * A decoded font family.
 */
export type FontFamily = typeof FontFamily.Type;

/**
 * A decoded font source.
 */
export type FontSource = typeof FontSource.Type;
