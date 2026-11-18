import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

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
} from '#layouts/layout-fields.ts';

/**
 * The fewest testimonials: one speaker belongs in quote.
 */
export const MIN_VOICES = 2;

/**
 * The most testimonials: three equal columns keep each speaker readable.
 */
export const MAX_VOICES = 3;

/**
 * The longest quote in characters, without its quotation marks, in a pair of columns.
 */
export const VOICE_QUOTE_MAX_CHARS = 100;

/**
 * The longest quote in characters in a third of the row, fitted to three lines.
 */
export const VOICE_QUOTE_MAX_CHARS_IN_THREE = 64;

/**
 * The longest speaker name in characters.
 */
export const VOICE_NAME_MAX_CHARS = 28;

/**
 * The longest speaker name in characters when three columns share the row.
 */
export const VOICE_NAME_MAX_CHARS_IN_THREE = 20;

/**
 * The longest speaker role in characters, wrapped beneath the name.
 */
export const VOICE_ROLE_MAX_CHARS = 40;

/**
 * The longest title in characters, fitted to at most two lines.
 */
export const VOICES_TITLE_MAX_CHARS = 60;

/**
 * The most words of the source or caveat beneath the testimonials.
 */
const VOICES_FOOTNOTE_MAX_WORDS = 16;

/**
 * One attributed testimonial; a missing photo leaves a name-only attribution.
 */
const Voice = Schema.Struct({
  quote: textField(VOICE_QUOTE_MAX_CHARS, 'a testimonial'),
  name: textField(VOICE_NAME_MAX_CHARS, 'a speaker name'),
  role: textField(VOICE_ROLE_MAX_CHARS, 'a speaker role'),
  photo: Schema.optionalKey(Schema.NonEmptyString),
  focal: FocalField,
});

/**
 * One decoded speaker and their words.
 */
export type VoiceEntry = typeof Voice.Type;

/**
 * The contract of voices: two or three short testimonials supporting one assertion.
 */
export const voicesLayoutContract = defineLayoutContract({
  name: 'voices',
  description:
    'Two or three short testimonials supporting one point, set as equal columns under an ' +
    'assertion title. Each entry in `voices:` has a `quote`, `name` and `role`, with an optional ' +
    '`photo` and `focal`; without a photo the attribution uses name and role only. The words use the ' +
    'brand quote style fitted to their columns, with hanging marks and aligned ' +
    'attributions. Keep each quote to one to three lines; three voices take shorter quotes ' +
    'and names so the quote stays above body size and the attribution stays on the grid. ' +
    '`reveal: true` brings the speakers in one per step. Use it to show a shared experience ' +
    'across customers or stakeholders. Use quote when one person needs the whole stage, proof ' +
    'when a customer result needs numbers, and team when introducing people ' +
    'rather than their words.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    voices: Schema.Array(Voice).check(
      Schema.isMinLength(MIN_VOICES, { message: `Expected at least ${MIN_VOICES} voices` }),
      Schema.isMaxLength(MAX_VOICES, { message: `Expected at most ${MAX_VOICES} voices` }),
    ),
    treatment: TreatmentField,
    reveal: RevealField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    voices:
      `List ${MIN_VOICES} to ${MAX_VOICES} speakers, each with a \`quote\` of up to ` +
      `${VOICE_QUOTE_MAX_CHARS} characters ` +
      `(${VOICE_QUOTE_MAX_CHARS_IN_THREE} with three voices), ` +
      `a \`name\` of up to ${VOICE_NAME_MAX_CHARS} characters ` +
      `(${VOICE_NAME_MAX_CHARS_IN_THREE} with three voices) and a \`role\` of up to ` +
      `${VOICE_ROLE_MAX_CHARS} characters. Omit quotation marks. Optionally add \`photo\` as a ` +
      'file in the deck folder; without it show the name and role only. ' +
      FOCAL_HINT,
    treatment: TREATMENT_HINT,
    reveal: REVEAL_HINT,
    chrome: CHROME_HINT,
  },
  title: { required: true, maxChars: VOICES_TITLE_MAX_CHARS },
  slots: {
    body: {
      description: 'One sentence of context. Put the testimonials in `voices:`, not here.',
      accepts: ['text'],
    },
    footnote: {
      description: 'The source, interview date or caveat for these testimonials.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: CONTEXT_MAX_WORDS },
    footnote: { maxWords: VOICES_FOOTNOTE_MAX_WORDS },
  },
  variants: [
    {
      name: 'three voices',
      when: { counts: { voices: MAX_VOICES } },
      budget: {},
      fields: {
        'voices[].quote': { maxChars: VOICE_QUOTE_MAX_CHARS_IN_THREE },
        'voices[].name': { maxChars: VOICE_NAME_MAX_CHARS_IN_THREE },
      },
    },
  ],
  pptx: {
    type: 'title-only',
    placeholders: [
      { kind: 'title', from: { selector: '.kit-title' } },
      { kind: 'body', from: { slot: 'body' } },
    ],
  },
  example: {
    frontmatter: {
      title: 'Shade changes how people use their street',
      eyebrow: 'Residents on the first summer',
      voices: [
        {
          quote: 'My mother sat outside again in August.',
          name: 'Priya Nair',
          role: 'Holloway tenants’ association',
        },
        {
          quote: 'We walk to school under the trees now.',
          name: 'Sam Okafor',
          role: 'Eastgate parent',
        },
      ],
    },
    body: [
      '<Footnote>Resident interviews, September 2026.</Footnote>',
      '',
      '<Notes>',
      'Read the two experiences, then return to the shared point: people use the shade.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
