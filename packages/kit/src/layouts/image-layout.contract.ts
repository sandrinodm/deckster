import { defineLayoutContract } from '@deckster/engine/layout';
import { Effect, Schema } from 'effect';

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
 * Where the title and text sit over the photo: along the bottom, in the left or right third, or
 * nowhere (the photo alone, with its caption).
 */
export const IMAGE_TEXT_PLACES = ['bottom', 'left', 'right', 'none'] as const;

/**
 * One of {@link IMAGE_TEXT_PLACES}.
 */
export type ImageTextPlace = (typeof IMAGE_TEXT_PLACES)[number];

/**
 * The longest title over a photo, in characters: two lines of headline type in the text block.
 */
export const IMAGE_TITLE_MAX_CHARS = 44;

/**
 * The most words of the line under the title when the text sits in the left or right third.
 */
export const IMAGE_SIDE_BODY_MAX_WORDS = 14;

/**
 * The contract of the `image` layout: one photo across the whole slide, with an optional title over
 * a scrim.
 */
export const imageLayoutContract = defineLayoutContract({
  name: 'image',
  description:
    'One photo across the whole slide, edge to edge, for a place, a moment or a scale the room ' +
    'should see. `text:` puts the title and a line of text over it along the `bottom` (the ' +
    'default), in the `left` or `right` third, or leaves the photo alone (`none`). Text over the ' +
    'photo is always white on a dark scrim sized to it, whatever the surface, so it reads on any ' +
    'photo; the caption (a credit, a place and date) gets its own in the opposite corner, and ' +
    'the photo alone has none. Put the text where the photo is calm (sky, road, wall), not over ' +
    'the subject. `focal` keeps the subject in view when the photo is cropped to 16:9; use a ' +
    'photo at least 1920 pixels wide. Use split when the photo needs more than a line of text ' +
    'beside it. Defaults to the inverse surface and hides the page chrome.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    text: Schema.Literals(IMAGE_TEXT_PLACES).pipe(
      Schema.withDecodingDefaultKey(Effect.succeed<ImageTextPlace>('bottom')),
    ),
    focal: FocalField,
    treatment: TreatmentField,
    chrome: chromeField(false),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    text:
      'Write `text: left` or `text: right` to set the title in that third, `text: none` for the ' +
      'photo alone, or leave it out for the bottom.',
    focal: FOCAL_HINT,
    treatment: TREATMENT_HINT,
    chrome: CHROME_HINT,
  },
  title: { required: true, maxChars: IMAGE_TITLE_MAX_CHARS },
  slots: {
    body: {
      description: 'One line under the title, over the photo; leave it out for a title alone.',
      accepts: ['text'],
    },
    media: {
      description:
        "The photo: one <img> with alt text, or a markdown image, from the deck's assets/. It " +
        'is cropped to fill the slide.',
      required: true,
      accepts: ['image'],
    },
    caption: {
      description: 'A credit or place and date, in the bottom corner opposite the text.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: 24 },
    caption: { maxWords: 14 },
  },
  // In a third of the slide the text block is five columns wide: a short line under the title.
  variants: (['left', 'right'] as const).map((place) => ({
    name: `text ${place}`,
    when: { fields: { text: place } },
    budget: { body: { maxWords: IMAGE_SIDE_BODY_MAX_WORDS } },
  })),
  surface: 'inverse',
  pptx: {
    type: 'title-only',
    placeholders: [
      { kind: 'title', from: { selector: '.kit-image-title' } },
      { kind: 'body', from: { slot: 'body' } },
    ],
  },
  example: {
    frontmatter: {
      title: 'This is what 25% canopy looks like',
      eyebrow: 'Westgate, July',
    },
    body: [
      'Every street in Eastgate could look like this by 2040.',
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
      '<Caption>Westgate, July 2026.</Caption>',
      '',
      '<Notes>',
      'Let the photo sit for a breath before you say the line.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
