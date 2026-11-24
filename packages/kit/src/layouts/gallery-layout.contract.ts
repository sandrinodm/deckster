import { defineLayoutContract } from '@deckster/engine/layout';
import { Effect, Schema } from 'effect';

import {
  CHROME_HINT,
  chromeField,
  CONTEXT_MAX_WORDS,
  EYEBROW_HINT,
  EyebrowField,
  FOCAL_HINT,
  FocalField,
  textField,
  TREATMENT_HINT,
  TreatmentField,
} from '#layout-fields.ts';

/**
 * The fewest pictures a gallery shows; one picture is an image or split slide.
 */
export const MIN_PICTURES = 2;

/**
 * The most pictures a gallery shows; more are too small to read from the room.
 */
export const MAX_PICTURES = 4;

/**
 * The longest caption, in characters: two lines under the narrowest picture of two or three.
 */
export const PICTURE_CAPTION_MAX_CHARS = 64;

/**
 * The longest caption of four pictures, in characters: two lines under a three-column picture.
 */
export const PICTURE_CAPTION_MAX_CHARS_IN_FOUR = 40;

/**
 * The longest description of a picture, in characters.
 */
export const PICTURE_ALT_MAX_CHARS = 120;

/**
 * The longest gallery title, in characters: two lines at the smallest fit step.
 */
export const GALLERY_TITLE_MAX_CHARS = 60;

/**
 * The most words of the source or credit for the pictures on the bottom line.
 */
const GALLERY_FOOTNOTE_MAX_WORDS = 20;

/**
 * How a picture takes its frame: cropped to fill it, or shown whole on the frame's panel.
 */
export const PICTURE_FITS = ['cover', 'contain'] as const;

/**
 * One of {@link PICTURE_FITS}.
 */
export type GalleryFit = (typeof PICTURE_FITS)[number];

/**
 * A picture for the example that needs no file: a street under trees, drawn in a few flat shapes.
 */
const EXAMPLE_PICTURE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 90'%3E" +
  "%3Crect width='160' height='90' fill='%238fa79a'/%3E" +
  "%3Ccircle cx='40' cy='34' r='30' fill='%235d7d6b'/%3E" +
  "%3Ccircle cx='118' cy='30' r='34' fill='%234f6e5d'/%3E" +
  "%3Crect y='66' width='160' height='24' fill='%23707786'/%3E%3C/svg%3E";

/**
 * One picture: the file, what it shows, a caption, and how it is cropped.
 */
const Picture = Schema.Struct({
  src: Schema.NonEmptyString,
  alt: textField(PICTURE_ALT_MAX_CHARS, 'a picture description'),
  caption: Schema.optionalKey(textField(PICTURE_CAPTION_MAX_CHARS, 'a caption')),
  focal: FocalField,
  fit: Schema.Literals(PICTURE_FITS).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed<GalleryFit>('cover')),
  ),
});

/**
 * One picture as a slide's frontmatter writes it, decoded.
 */
export type GalleryPicture = typeof Picture.Type;

/**
 * The contract of the `gallery` layout: two to four photos or screenshots in an asymmetric
 * arrangement, each with its caption under it.
 */
export const galleryLayoutContract = defineLayoutContract({
  name: 'gallery',
  description:
    'Two to four photos or screenshots under the title, filling the slide in an asymmetric ' +
    'arrangement: the first picture is the lead and takes the largest frame on the left, the ' +
    'others share the right. Each picture, from `pictures:`, has `src` and `alt` and optionally ' +
    'a `caption` set under it, never over it; `fit: contain` shows a screenshot whole instead of ' +
    'cropping it. Defaults to the inverse surface, where screens and photos read like prints on ' +
    'a light table. Use it for product shots, screens of a flow, or a site from several sides; ' +
    'use before-after for two pictures of one change, split for one picture with text beside ' +
    'it, image for one photo across the slide, and bento when the pictures share the slide ' +
    'with figures.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    pictures: Schema.Array(Picture).check(
      Schema.isMinLength(MIN_PICTURES, { message: `Expected at least ${MIN_PICTURES} pictures` }),
      Schema.isMaxLength(MAX_PICTURES, { message: `Expected at most ${MAX_PICTURES} pictures` }),
    ),
    treatment: TreatmentField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    pictures:
      `List ${MIN_PICTURES} to ${MAX_PICTURES} pictures, the lead first, each with \`src\` (a ` +
      'file in the deck folder, such as assets/street.jpg), `alt` (what it shows, up to ' +
      `${PICTURE_ALT_MAX_CHARS} characters) and optionally \`caption\` (up to ` +
      `${PICTURE_CAPTION_MAX_CHARS}, ${PICTURE_CAPTION_MAX_CHARS_IN_FOUR} with four pictures), ` +
      `\`fit: contain\` for a screenshot to show whole, and \`focal\`. ${FOCAL_HINT}`,
    treatment: TREATMENT_HINT,
    chrome: CHROME_HINT,
  },
  title: { required: true, maxChars: GALLERY_TITLE_MAX_CHARS },
  slots: {
    body: {
      description:
        'One sentence under the title on what the pictures show together. Put the pictures in ' +
        '`pictures:`, not here.',
      accepts: ['text'],
    },
    footnote: {
      description: 'A source or credit for the pictures, on the bottom line.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: CONTEXT_MAX_WORDS },
    footnote: { maxWords: GALLERY_FOOTNOTE_MAX_WORDS },
  },
  variants: [
    {
      name: 'four pictures',
      when: { counts: { pictures: MAX_PICTURES } },
      budget: {},
      // The two smallest pictures share half of the right column.
      fields: { 'pictures[].caption': { maxChars: PICTURE_CAPTION_MAX_CHARS_IN_FOUR } },
    },
  ],
  surface: 'inverse',
  pptx: {
    type: 'title-only',
    placeholders: [
      { kind: 'title', from: { selector: '.kit-title' } },
      { kind: 'body', from: { slot: 'body' } },
    ],
  },
  example: {
    frontmatter: {
      title: 'Three streets, three summers after planting',
      eyebrow: 'Eastgate pilot',
      pictures: [
        {
          src: EXAMPLE_PICTURE,
          alt: 'Harrow Road in July, under young plane trees',
          caption: 'Harrow Road: shade on both pavements by the third July.',
        },
        {
          src: EXAMPLE_PICTURE,
          alt: 'Mill Lane with a row of new limes',
          caption: 'Mill Lane: limes planted in soil cells.',
        },
        {
          src: EXAMPLE_PICTURE,
          alt: 'Station Square with oaks around the benches',
          caption: 'Station Square: oaks where the benches are.',
        },
      ],
    },
    body: [
      '<Footnote>Photos: Larkfield Urban Forestry Division, July 2026.</Footnote>',
      '',
      '<Notes>',
      'Start with Harrow Road, the largest picture: it was bare tarmac three years ago.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
