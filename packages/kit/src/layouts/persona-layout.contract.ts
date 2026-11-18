import { defineLayoutContract } from '@deckster/engine/layout';
import { Effect, Schema } from 'effect';

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
 * The longest persona name, in characters, in the portrait's three-column measure.
 */
export const PERSONA_NAME_MAX_CHARS = 28;

/**
 * The longest role, in characters: a short description of the research participant.
 */
export const PERSONA_ROLE_MAX_CHARS = 40;

/**
 * The fewest items in each research list.
 */
export const MIN_PERSONA_ITEMS = 2;

/**
 * The most items in each research list; longer findings belong on another slide.
 */
export const MAX_PERSONA_ITEMS = 4;

/**
 * The longest goal or frustration, in characters.
 */
export const PERSONA_ITEM_MAX_CHARS = 40;

/**
 * The longest heading above either research list, in characters.
 */
export const PERSONA_LABEL_MAX_CHARS = 16;

/**
 * Headings used when the author leaves a research label out.
 */
export const DEFAULT_PERSONA_LABELS = {
  /**
   * The heading above the persona's desired outcomes.
   */
  goals: 'Goals',

  /**
   * The heading above the persona's obstacles.
   */
  frustrations: 'Frustrations',
} as const;

/**
 * The most words in the participant's quotation.
 */
export const PERSONA_QUOTE_MAX_WORDS = 24;

/**
 * The longest assertion title, in characters, kept to one line above the research.
 */
export const PERSONA_TITLE_MAX_CHARS = 50;

/**
 * The most words in a source or research caveat on the bottom line.
 */
const PERSONA_FOOTNOTE_MAX_WORDS = 16;

/**
 * A list of short research findings, bounded so both columns fit beside the portrait.
 */
const PersonaItems = Schema.Array(textField(PERSONA_ITEM_MAX_CHARS, 'a research item')).check(
  Schema.isMinLength(MIN_PERSONA_ITEMS, {
    message: `Expected at least ${MIN_PERSONA_ITEMS} research items`,
  }),
  Schema.isMaxLength(MAX_PERSONA_ITEMS, {
    message: `Expected at most ${MAX_PERSONA_ITEMS} research items`,
  }),
);

/**
 * The contract of the `persona` layout: one research persona, their own words and their needs.
 */
export const personaLayoutContract = defineLayoutContract({
  name: 'persona',
  description:
    'A user persona grounded in research: a portrait with `name:` and `role:` on the left, ' +
    'a prominent quotation in their own words directly above two labelled lists, `goals:` and ' +
    '`frustrations:`, on the right. The title states what this person needs from the product, ' +
    'rather than repeating their name. Without `photo:` the portrait becomes an initials tile; ' +
    '`focal:` and `treatment:` work as on bio. Use it to connect a design decision to a ' +
    'participant’s motivations and obstacles. Use bio to introduce a speaker, quote when only ' +
    'their words matter, or proof to show a customer’s measured outcome. Use cards or columns ' +
    'for findings pooled across many participants rather than one person. Override the list ' +
    'headings with `labels:`.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    name: textField(PERSONA_NAME_MAX_CHARS, 'a name'),
    role: textField(PERSONA_ROLE_MAX_CHARS, 'a role'),
    photo: Schema.optionalKey(Schema.NonEmptyString),
    focal: FocalField,
    treatment: TreatmentField,
    labels: Schema.Struct({
      goals: textField(PERSONA_LABEL_MAX_CHARS, 'a goals label').pipe(
        Schema.withDecodingDefaultKey(Effect.succeed(DEFAULT_PERSONA_LABELS.goals)),
      ),
      frustrations: textField(PERSONA_LABEL_MAX_CHARS, 'a frustrations label').pipe(
        Schema.withDecodingDefaultKey(Effect.succeed(DEFAULT_PERSONA_LABELS.frustrations)),
      ),
    }).pipe(Schema.withDecodingDefaultKey(Effect.succeed(DEFAULT_PERSONA_LABELS))),
    goals: PersonaItems,
    frustrations: PersonaItems,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    name: `Name the research persona, up to ${PERSONA_NAME_MAX_CHARS} characters.`,
    role: `Say who they are in one line, up to ${PERSONA_ROLE_MAX_CHARS} characters.`,
    photo:
      'Give a portrait as a file in the deck folder, such as `photo: assets/dana.jpg`, ' +
      'or leave it out for an initials tile, as on bio.',
    focal: FOCAL_HINT,
    treatment: TREATMENT_HINT,
    labels: `Override either research heading, each up to ${PERSONA_LABEL_MAX_CHARS} characters.`,
    goals:
      `List ${MIN_PERSONA_ITEMS} to ${MAX_PERSONA_ITEMS} things the person wants to achieve, ` +
      `each up to ${PERSONA_ITEM_MAX_CHARS} characters.`,
    frustrations:
      `List ${MIN_PERSONA_ITEMS} to ${MAX_PERSONA_ITEMS} obstacles in the person’s day, ` +
      `each up to ${PERSONA_ITEM_MAX_CHARS} characters.`,
    chrome: CHROME_HINT,
  },
  title: { required: true, maxChars: PERSONA_TITLE_MAX_CHARS },
  slots: {
    body: {
      description:
        'A short quotation in the person’s own words, without outer quotation marks. ' +
        'Leave it out if no verbatim quotation was recorded.',
      accepts: ['text'],
    },
    footnote: {
      description: 'The research source, interview date or a caveat about the persona.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: PERSONA_QUOTE_MAX_WORDS },
    footnote: { maxWords: PERSONA_FOOTNOTE_MAX_WORDS },
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
      title: 'Residents need a watering plan they can keep',
      eyebrow: 'Resident research',
      name: 'Nia Mensah',
      role: 'Volunteer tree warden, Eastgate',
      labels: { goals: 'Goals', frustrations: 'Frustrations' },
      goals: ['Keep the new trees alive', 'Share the watering rounds'],
      frustrations: ['Unclear watering advice', 'No cover during holidays'],
    },
    body: [
      'I can water on Tuesdays, but I need to know someone has the rest of the week.',
      '',
      '<Footnote>Illustrative persona based on the Eastgate watering study.</Footnote>',
      '',
      '<Notes>',
      'Connect the need for shared rounds to the proposed watering rota.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
