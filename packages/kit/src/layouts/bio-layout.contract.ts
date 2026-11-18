import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import {
  CHROME_HINT,
  chromeField,
  ContactItem,
  contactsHint,
  EYEBROW_HINT,
  EyebrowField,
  FOCAL_HINT,
  FocalField,
  textField,
  TREATMENT_HINT,
  TreatmentField,
} from '#layouts/layout-fields.ts';

/**
 * The longest name, in characters: one line at the headline step in six columns, two at most.
 */
export const BIO_NAME_MAX_CHARS = 32;

/**
 * The longest role, in characters: two lines at the lead step.
 */
export const BIO_ROLE_MAX_CHARS = 48;

/**
 * The most contacts a bio lists.
 */
export const MAX_BIO_CONTACTS = 2;

/**
 * The contract of the `bio` layout: one speaker, with a portrait, a few facts and how to reach
 * them.
 */
export const bioLayoutContract = defineLayoutContract({
  name: 'bio',
  description:
    'Introduces one person, usually the speaker: a portrait filling the left five columns, their ' +
    '`name:` and `role:` beside it, a few facts as a sentence or up to three bullets, and up to ' +
    'two `contacts:` (email, site or handle) stacked on the bottom line. Without `photo:` the ' +
    'portrait is a tile with their initials. Use it once, near the start; use team for three or ' +
    'more people and quote for someone speaking for the point. `title:` names the slide in the ' +
    'outline and is not shown; ' +
    'use persona for a user profile with goals and frustrations.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    name: textField(BIO_NAME_MAX_CHARS, 'a name'),
    role: Schema.optionalKey(textField(BIO_ROLE_MAX_CHARS, 'a role')),
    photo: Schema.optionalKey(Schema.NonEmptyString),
    focal: FocalField,
    treatment: TreatmentField,
    contacts: Schema.optionalKey(
      Schema.Array(ContactItem).check(
        Schema.isMaxLength(MAX_BIO_CONTACTS, {
          message: `Expected at most ${MAX_BIO_CONTACTS} contacts`,
        }),
      ),
    ),
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    name: `Write the person's name, up to ${BIO_NAME_MAX_CHARS} characters.`,
    role:
      'Say what they do in a line, for example `role: Programme lead, Larkfield Urban Forestry` ' +
      `(up to ${BIO_ROLE_MAX_CHARS} characters).`,
    photo:
      'Give the portrait as a file in the deck folder, for example `photo: assets/dana.jpg` ' +
      '(or relative to the slide, `../assets/dana.jpg`); without one the layout draws an ' +
      'initials tile.',
    focal: FOCAL_HINT,
    treatment: TREATMENT_HINT,
    contacts: contactsHint(MAX_BIO_CONTACTS),
    chrome: CHROME_HINT,
  },
  slots: {
    body: {
      description:
        'A few facts that make the person worth listening to: a sentence, or up to three short ' +
        'bullets.',
      accepts: ['text', 'bullets'],
    },
  },
  budget: {
    body: { maxWords: 28, maxBullets: 3 },
  },
  pptx: {
    type: 'two-content',
    placeholders: [
      { kind: 'title', from: { selector: '.kit-bio-name' } },
      { kind: 'subtitle', from: { selector: '.kit-bio-role' } },
      { kind: 'body', from: { slot: 'body' } },
    ],
  },
  example: {
    frontmatter: {
      title: 'Who is speaking',
      eyebrow: 'Your speaker',
      name: 'Dana Okafor',
      role: 'Programme lead, Larkfield Urban Forestry',
      contacts: [
        {
          label: 'Email',
          text: 'dana.okafor@larkfield.example',
          href: 'mailto:dana.okafor@larkfield.example',
        },
        { label: 'Slides', text: 'larkfield.example/canopy' },
      ],
    },
    body: [
      '- Twelve years planting street trees in three cities',
      '- Led the Holloway Road pilot, 2024 to 2026',
      '',
      '<Notes>',
      'Keep this to twenty seconds: why you, then straight into why Eastgate.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
