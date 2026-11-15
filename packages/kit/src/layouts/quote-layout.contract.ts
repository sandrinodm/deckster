import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import {
  CHROME_HINT,
  chromeField,
  EYEBROW_HINT,
  EyebrowField,
  FOCAL_HINT,
  FocalField,
  textField,
  TREATMENT_HINT,
  TreatmentField,
} from '#layouts/layout-fields.ts';

/**
 * The longest name of the person quoted, in characters.
 */
export const QUOTE_NAME_MAX_CHARS = 40;

/**
 * The longest role of the person quoted, in characters: one line under the name.
 */
export const QUOTE_ROLE_MAX_CHARS = 64;

/**
 * The most words a quote takes: four lines at the quote size's smallest fit step beside a portrait.
 */
export const QUOTE_MAX_WORDS = 36;

/**
 * The contract of the `quote` layout: a person's words, with who they are and, optionally, their
 * portrait.
 */
export const quoteLayoutContract = defineLayoutContract({
  name: 'quote',
  description:
    'A person speaking for the point: a testimonial, a resident, a user, a partner. The words ' +
    'are set large in the brand quote style with hanging marks; `name:` and `role:` say who ' +
    'said it, and `photo:` sets their portrait beside the quote (cropped to it, the face kept ' +
    'in view with `focal`). Keep it to one to three sentences; a longer quote steps down in ' +
    "size and past 36 words is cut. Use statement for the talk's own claim, and team or bio " +
    'to introduce people.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    name: textField(QUOTE_NAME_MAX_CHARS, 'a name'),
    role: Schema.optionalKey(textField(QUOTE_ROLE_MAX_CHARS, 'a role')),
    photo: Schema.optionalKey(Schema.NonEmptyString),
    focal: FocalField,
    treatment: TreatmentField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    name:
      `Name who said it, for example \`name: Mariam Haddad\` (up to ${QUOTE_NAME_MAX_CHARS} ` +
      'characters).',
    role:
      'Say who they are in a few words, for example `role: Charge nurse, Eastgate General` ' +
      `(up to ${QUOTE_ROLE_MAX_CHARS} characters).`,
    photo:
      'Give their portrait as a file in the deck folder, for example ' +
      '`photo: assets/mariam.jpg`, or leave it out to set the quote across the slide.',
    focal: FOCAL_HINT,
    treatment: TREATMENT_HINT,
    chrome: CHROME_HINT,
  },
  slots: {
    body: {
      description:
        'The words, without quotation marks (the layout sets them): one to three sentences.',
      required: true,
      accepts: ['quote', 'text'],
    },
  },
  budget: {
    body: { maxWords: QUOTE_MAX_WORDS },
  },
  pptx: {
    type: 'content',
    placeholders: [
      { kind: 'title', from: { field: 'title' } },
      { kind: 'body', from: { slot: 'body' } },
    ],
  },
  example: {
    frontmatter: {
      title: 'What the night nurses told us',
      eyebrow: 'From the ward',
      name: 'Mariam Haddad',
      role: 'Charge nurse, Eastgate General Hospital',
    },
    body: [
      'The worst nights are the second and third of a heatwave, when the flats never cool down.',
      '',
      '<Notes>',
      'Read the quote slowly, then pause before the next slide.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
