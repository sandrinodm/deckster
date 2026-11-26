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
  REVEAL_HINT,
  RevealField,
  textField,
  TREATMENT_HINT,
  TreatmentField,
} from '#layout-fields.ts';

/**
 * The longest label over either picture, in characters, kept to one line.
 */
export const BEFORE_AFTER_LABEL_MAX_CHARS = 20;

/**
 * The longest caption under either picture, in characters, kept to one line.
 */
export const BEFORE_AFTER_CAPTION_MAX_CHARS = 48;

/**
 * The longest accessible description of either picture, in characters.
 */
export const BEFORE_AFTER_ALT_MAX_CHARS = 120;

/**
 * The longest assertion title, in characters, fitted to one line above the pair.
 */
export const BEFORE_AFTER_TITLE_MAX_CHARS = 50;

/**
 * The most words in the source or caveat below the pictures.
 */
const BEFORE_AFTER_FOOTNOTE_MAX_WORDS = 16;

/**
 * A file-free picture for the catalog example, with explicit dimensions for media inspection.
 */
const EXAMPLE_PICTURE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1600' height='1000'%3E" +
  "%3Crect width='1600' height='1000' fill='%238fa79a'/%3E%3C/svg%3E";

/**
 * One side's picture and text. Its label defaults to the side's name when omitted.
 *
 * @param label - The default label, Before or After.
 */
function pictureField(label: string) {
  return Schema.Struct({
    src: Schema.NonEmptyString,
    alt: textField(BEFORE_AFTER_ALT_MAX_CHARS, 'a picture description'),
    label: textField(BEFORE_AFTER_LABEL_MAX_CHARS, 'a picture label').pipe(
      Schema.withDecodingDefaultKey(Effect.succeed(label)),
    ),
    caption: Schema.optionalKey(textField(BEFORE_AFTER_CAPTION_MAX_CHARS, 'a picture caption')),
    focal: FocalField,
  });
}

/**
 * One side of the pair, decoded with its default label.
 */
export type BeforeAfterPicture = ReturnType<typeof pictureField>['Type'];

/**
 * The contract of the `before-after` layout: two equally sized, labelled pictures of one change.
 */
export const beforeAfterLayoutContract = defineLayoutContract({
  name: 'before-after',
  description:
    'Two pictures side by side at the same size, labelled Before and After, under a title that ' +
    'states what changed. Each side has a required file and accessible description, an optional ' +
    'label and a one-line caption below the picture. Both pictures share `fit`: contain shows ' +
    "them whole (the default), cover crops them into equal frames around each side's focal point. " +
    'The after label carries the accent unless `accent: none`; labels always name the sides ' +
    'so colour alone never carries the change. `reveal: true` brings in before first, then after. ' +
    'Use it for a redesign, a restoration or visual evidence of a change. Use gallery for an ' +
    'unpaired collection with a lead picture, screen for one interface with callouts, and shift ' +
    'when the change is an argument in words and figures rather than two pictures.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    before: pictureField('Before'),
    after: pictureField('After'),
    fit: Schema.Literals(['contain', 'cover']).pipe(
      Schema.withDecodingDefaultKey(Effect.succeed<'contain' | 'cover'>('contain')),
    ),
    accent: Schema.Literals(['after', 'none']).pipe(
      Schema.withDecodingDefaultKey(Effect.succeed<'after' | 'none'>('after')),
    ),
    treatment: TreatmentField,
    reveal: RevealField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    before:
      'Name the earlier picture with `src` (a file in the deck folder) and `alt` (up to ' +
      `${BEFORE_AFTER_ALT_MAX_CHARS} characters). Optionally add \`label\` (up to ` +
      `${BEFORE_AFTER_LABEL_MAX_CHARS} characters, default "Before"), \`caption\` (one line, ` +
      `up to ${BEFORE_AFTER_CAPTION_MAX_CHARS} characters), and \`focal\`. ${FOCAL_HINT}`,
    after:
      'Name the later picture with `src` (a file in the deck folder) and `alt` (up to ' +
      `${BEFORE_AFTER_ALT_MAX_CHARS} characters). Optionally add \`label\` (up to ` +
      `${BEFORE_AFTER_LABEL_MAX_CHARS} characters, default "After"), \`caption\` (one line, ` +
      `up to ${BEFORE_AFTER_CAPTION_MAX_CHARS} characters), and \`focal\`. ${FOCAL_HINT}`,
    fit: 'Use `contain` (the default) to show both pictures whole, or `cover` to crop both to fill equal frames.',
    accent:
      'Use `accent: none` for neutral labels; by default the after label uses accent text, ' +
      'or foreground text on an accent slide.',
    treatment:
      TREATMENT_HINT +
      ' With contain, omitted treatment defaults to plain; cover uses the brand default.',
    reveal: REVEAL_HINT,
    chrome: CHROME_HINT,
  },
  title: { required: true, maxChars: BEFORE_AFTER_TITLE_MAX_CHARS },
  slots: {
    body: {
      description: 'One sentence under the title explaining what to compare between the pictures.',
      accepts: ['text'],
    },
    footnote: {
      description: 'A source, date or qualification on the bottom line.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: CONTEXT_MAX_WORDS },
    footnote: { maxWords: BEFORE_AFTER_FOOTNOTE_MAX_WORDS },
  },
  pptx: {
    type: 'two-content',
    placeholders: [
      { kind: 'title', from: { selector: '.kit-title' } },
      { kind: 'body', from: { slot: 'body' } },
    ],
  },
  example: {
    frontmatter: {
      title: 'The same street now has summer shade',
      before: {
        src: EXAMPLE_PICTURE,
        alt: 'Harrow Road before the planting programme',
        caption: 'Harrow Road, before planting',
      },
      after: {
        src: EXAMPLE_PICTURE,
        alt: 'Harrow Road three summers after planting',
        caption: 'Harrow Road, three summers later',
      },
    },
    body: '<Notes>Compare the same stretch of pavement before and after planting.</Notes>\n',
  },
});
