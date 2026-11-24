import { defineLayoutContract } from '@deckster/engine/layout';
import { Effect, Schema } from 'effect';

import { AlignField, alignHint } from '#layouts/display-fields.ts';
import {
  CHROME_HINT,
  chromeField,
  EYEBROW_HINT,
  EyebrowField,
  FOCAL_HINT,
  FocalField,
  TREATMENT_HINT,
  TreatmentField,
} from '#layouts/layout-fields.ts';

/**
 * The edge the title and subtitle bar docks to on the reveal step: `bottom` (a full-width footer
 * bar, the default) or `top` (a full-width header bar).
 */
export const IMAGE_REVEAL_DOCKS = ['bottom', 'top'] as const;

/**
 * One of {@link IMAGE_REVEAL_DOCKS}.
 */
export type ImageRevealDock = (typeof IMAGE_REVEAL_DOCKS)[number];

/**
 * Brand surfaces the docked header/footer bar can take, guaranteed to exist on every brand.
 */
export const IMAGE_REVEAL_BAR_SURFACES = ['default', 'inverse', 'accent', 'gradient'] as const;

/**
 * One of {@link IMAGE_REVEAL_BAR_SURFACES}.
 */
export type ImageRevealBarSurface = (typeof IMAGE_REVEAL_BAR_SURFACES)[number];

/**
 * How the revealed image fills the remaining area beside the docked bar: `cover` crops it edge to
 * edge around `focal` (the default); `contain` shows the whole image uncropped with breathing
 * room.
 */
export const IMAGE_REVEAL_FITS = ['cover', 'contain'] as const;

/**
 * One of {@link IMAGE_REVEAL_FITS}.
 */
export type ImageRevealFit = (typeof IMAGE_REVEAL_FITS)[number];

/**
 * The longest title, in characters: fits comfortably in display type on step 0 and in the
 * full-width docked bar on step 1.
 */
export const IMAGE_REVEAL_TITLE_MAX_CHARS = 44;

/**
 * The most words in the subtitle, kept to one clear sentence on step 0 and a compact line in the
 * docked bar on step 1.
 */
export const IMAGE_REVEAL_SUBTITLE_MAX_WORDS = 16;

/**
 * The longest custom CSS color or paint string accepted for the docked bar's background or border.
 */
export const IMAGE_REVEAL_PAINT_MAX_CHARS = 120;

/**
 * Rejects CSS injection patterns (`url()`, `expression()`, semicolons and braces) while allowing
 * hex, functional colors (`rgb()`, `hsl()`, `oklch()`, `color-mix()`), gradients and custom
 * property references.
 */
const SAFE_CSS_PAINT_PATTERN = /^(?!.*(?:url\s*\(|expression\s*\(|;|[{}]))\S(?:.*\S)?$/iu;

/**
 * An optional CSS paint or color override for the docked bar.
 *
 * @param what - Field description for validation errors.
 */
function cssPaintField(what: string) {
  return Schema.optionalKey(
    Schema.NonEmptyString.check(
      Schema.isMaxLength(IMAGE_REVEAL_PAINT_MAX_CHARS, {
        message: `Expected ${what} of at most ${IMAGE_REVEAL_PAINT_MAX_CHARS} characters`,
      }),
      Schema.isPattern(SAFE_CSS_PAINT_PATTERN, {
        message: `Expected ${what} as a CSS color or gradient without url(), semicolons or braces`,
      }),
    ),
  );
}

/**
 * The contract of the `image-reveal` layout: opens as a full-slide title cover on step 0, then
 * animates the title and subtitle into a full-width header or footer bar on step 1 to reveal an
 * image across the rest of the slide.
 */
export const imageRevealLayoutContract = defineLayoutContract({
  name: 'image-reveal',
  description:
    'A two-step title-to-image reveal. Step 0 presents the slide as a title cover with the ' +
    'title, optional eyebrow and subtitle over the slide surface or `background:`. Step 1 ' +
    'animates the title and subtitle into a full-width bar docked to the `bottom` (footer, the ' +
    'default) or `top` (header) with a surface background and crisp edge border, revealing the ' +
    '<Media> image across the rest of the slide. Use `barSurface` (default, inverse, accent or ' +
    'gradient) for brand-matched bar styling, and optionally override `barBackground` or ' +
    '`barBorder` with custom CSS colors. `fit: cover` (the default) bleeds the image edge to edge ' +
    'around `focal`; `fit: contain` shows the whole image uncropped. Use it when you want to set ' +
    'up a visual moment with a title beat before unveiling the picture, screenshot or diagram. Use ' +
    'title for the deck cover and image when the photo should be visible immediately.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    dock: Schema.Literals(IMAGE_REVEAL_DOCKS).pipe(
      Schema.withDecodingDefaultKey(Effect.succeed<ImageRevealDock>('bottom')),
    ),
    align: AlignField,
    barSurface: Schema.Literals(IMAGE_REVEAL_BAR_SURFACES).pipe(
      Schema.withDecodingDefaultKey(Effect.succeed<ImageRevealBarSurface>('default')),
    ),
    barBackground: cssPaintField('a bar background'),
    barBorder: cssPaintField('a bar border color'),
    fit: Schema.Literals(IMAGE_REVEAL_FITS).pipe(
      Schema.withDecodingDefaultKey(Effect.succeed<ImageRevealFit>('cover')),
    ),
    focal: FocalField,
    treatment: TreatmentField,
    chrome: chromeField(false),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    dock:
      'Write `dock: top` to dock the title bar as a full-width header, or leave it out (`bottom`) ' +
      'for a full-width footer.',
    align: alignHint('the title and subtitle'),
    barSurface:
      'Choose a brand surface for the docked bar (`default`, `inverse`, `accent` or `gradient`), ' +
      'or leave it out for `default`.',
    barBackground:
      'Optionally override the docked bar background with a CSS color or gradient in at most ' +
      `${IMAGE_REVEAL_PAINT_MAX_CHARS} characters, such as \`#111827\`; pair a dark color with ` +
      '`barSurface: inverse` so bar text keeps contrast.',
    barBorder:
      'Optionally override the docked bar edge border color with a CSS color in at most ' +
      `${IMAGE_REVEAL_PAINT_MAX_CHARS} characters, such as \`#3b82f6\` or \`transparent\`.`,
    fit:
      'Use `cover` (the default) to fill the remaining area edge to edge, or `contain` to show ' +
      'the whole image uncropped.',
    focal: FOCAL_HINT,
    treatment:
      TREATMENT_HINT +
      ' With `fit: contain`, omitted treatment defaults to plain; `cover` uses the brand default.',
    chrome: CHROME_HINT,
  },
  title: { required: true, maxChars: IMAGE_REVEAL_TITLE_MAX_CHARS },
  slots: {
    body: {
      description:
        'The subtitle: one sentence shown under the title on step 0 and carried into the docked ' +
        'bar on step 1. Leave it out for a title alone.',
      accepts: ['text'],
    },
    media: {
      description:
        "The revealed image: one <img> with alt text, or a markdown image, from the deck's " +
        'assets/. Revealed on step 1 across the space outside the docked header or footer bar.',
      required: true,
      accepts: ['image'],
    },
  },
  budget: {
    body: { maxWords: IMAGE_REVEAL_SUBTITLE_MAX_WORDS },
  },
  surface: 'gradient',
  pptx: {
    type: 'title',
    placeholders: [
      { kind: 'title', from: { selector: '.kit-image-reveal-title' } },
      { kind: 'subtitle', from: { slot: 'body' } },
    ],
  },
  example: {
    frontmatter: {
      title: 'Shade is infrastructure',
      eyebrow: 'Westgate, July',
      dock: 'bottom',
    },
    body: [
      'A ten-year canopy plan for the neighbourhoods that heat up first.',
      '',
      '<Media>',
      '  <svg viewBox="0 0 1600 900" role="img" aria-label="A street under a full canopy, drawn"',
      '    preserveAspectRatio="xMidYMid slice" style={{ width: "100%", height: "100%" }}>',
      '    <rect width="1600" height="900" fill="var(--brand-color-surface)" />',
      '    <circle cx="460" cy="400" r="300" fill="var(--brand-color-border)" />',
      '    <circle cx="1160" cy="380" r="340" fill="var(--brand-color-muted)" />',
      '    <rect y="720" width="1600" height="180" fill="var(--brand-color-border)" />',
      '  </svg>',
      '</Media>',
      '',
      '<Notes>',
      'Hold on the cover beat for a moment, then advance to dock the title and reveal the street.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
