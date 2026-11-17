import { defineLayoutContract } from '@deckster/engine/layout';
import { Effect, Schema } from 'effect';

import { AlignField, alignHint } from '#layouts/display-fields.ts';
import {
  CHROME_HINT,
  chromeField,
  EYEBROW_HINT,
  EyebrowField,
  TREATMENT_HINT,
  TreatmentField,
} from '#layouts/layout-fields.ts';

/**
 * The longest byline, in characters.
 */
export const BYLINE_MAX_CHARS = 40;

/**
 * The longest date line, in characters.
 */
export const DATE_MAX_CHARS = 24;

/**
 * The longest deck title, in characters: three lines of display type beside a cover photo at the
 * smallest fit step.
 */
export const COVER_TITLE_MAX_CHARS = 36;

/**
 * Where a cover photo sits: `side`, filling the right five columns beside the text (the default),
 * or `full`, covering the whole slide with the text over it on dark scrims.
 */
export const COVER_PICTURES = ['side', 'full'] as const;

/**
 * One of {@link COVER_PICTURES}.
 */
export type CoverPicture = (typeof COVER_PICTURES)[number];

/**
 * The contract of the `title` layout: the deck's cover.
 */
export const titleLayoutContract = defineLayoutContract({
  name: 'title',
  description:
    'The cover of a deck: the deck title set large on the bottom line, a one-line subtitle, and ' +
    'who is presenting and when. Fill <Media> with a photo to give the cover an image that ' +
    'bleeds off the right edge; `picture: full` runs it across the whole slide, with the logo ' +
    'and text over it in white on dark scrims, for a photo with a calm lower left (sky, wall, ' +
    'road). `align: center` centres the logo, title and subtitle on a ' +
    'type-only cover, for a keynote or a short, bold title; with a photo the text stays on the ' +
    'left. Use it once, first; use section to open a part of the talk. ' +
    'Defaults to the gradient surface and hides the page chrome; the brand logo sits top left.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    byline: Schema.optionalKey(
      Schema.NonEmptyString.check(
        Schema.isMaxLength(BYLINE_MAX_CHARS, {
          message: `Expected a byline of at most ${BYLINE_MAX_CHARS} characters`,
        }),
      ),
    ),
    date: Schema.optionalKey(
      Schema.NonEmptyString.check(
        Schema.isMaxLength(DATE_MAX_CHARS, {
          message: `Expected a date of at most ${DATE_MAX_CHARS} characters`,
        }),
      ),
    ),
    treatment: TreatmentField,
    picture: Schema.Literals(COVER_PICTURES).pipe(
      Schema.withDecodingDefaultKey(Effect.succeed<CoverPicture>('side')),
    ),
    align: AlignField,
    chrome: chromeField(false),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    byline:
      `Name the presenter and team in at most ${BYLINE_MAX_CHARS} characters, for example ` +
      '`byline: Dana Okafor, Urban Forestry`.',
    date:
      `Write the date as the audience reads it, in at most ${DATE_MAX_CHARS} characters, for ` +
      'example `date: 18 November 2026`.',
    treatment: TREATMENT_HINT,
    picture:
      'Write `picture: full` to run the <Media> photo across the whole slide behind the text, or ' +
      'leave it out to set it in the right five columns.',
    align: alignHint('the logo, title and subtitle'),
    chrome: CHROME_HINT,
  },
  title: { required: true, maxChars: COVER_TITLE_MAX_CHARS },
  slots: {
    body: {
      description:
        'The subtitle: one sentence that says what the deck is for. Set the deck title itself ' +
        'in `title:`.',
      accepts: ['text'],
    },
    media: {
      description:
        'A photo for the cover, as one <img> with alt text; it fills the right five columns of ' +
        'the slide edge to edge, or the whole slide with `picture: full`, in the brand image ' +
        'treatment. Leave it out for a type-only cover.',
      accepts: ['image'],
    },
  },
  budget: {
    body: { maxWords: 14 },
  },
  surface: 'gradient',
  pptx: {
    type: 'title',
    placeholders: [
      { kind: 'title', from: { selector: '.kit-cover-title' } },
      { kind: 'subtitle', from: { slot: 'body' } },
    ],
  },
  example: {
    frontmatter: {
      title: 'Shade is infrastructure',
      eyebrow: 'Budget committee briefing',
      byline: 'Dana Okafor, Urban Forestry Division',
      date: '18 November 2026',
    },
    body: [
      'A ten-year canopy plan for the neighbourhoods that heat up first.',
      '',
      '<Notes>',
      'Open with the July heat map before you say anything about trees.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
