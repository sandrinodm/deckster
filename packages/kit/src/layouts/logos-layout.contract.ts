import { defineLayoutContract, type LayoutVariant } from '@deckster/engine/layout';
import { Effect, Schema } from 'effect';

import {
  CHROME_HINT,
  chromeField,
  CONTEXT_MAX_WORDS,
  EYEBROW_HINT,
  EyebrowField,
  textField,
  TREATMENT_HINT,
  TreatmentField,
} from '#layout-fields.ts';

/**
 * The fewest logos a logo wall shows.
 */
export const MIN_LOGOS = 3;

/**
 * The most logos a logo wall shows: three rows of six.
 */
export const MAX_LOGOS = 18;

/**
 * The longest organisation name, in characters: the logo's alt text, and the wordmark drawn when
 * there is no file.
 */
export const LOGO_NAME_MAX_CHARS = 32;

/**
 * The longest name drawn as a wordmark in a wall of thirteen or more, in characters: two lines in a
 * sixth of the row.
 */
export const LOGO_NAME_MAX_CHARS_DENSE = 20;

/**
 * The longest logos title, in characters: two lines at the smallest fit step.
 */
export const LOGOS_TITLE_MAX_CHARS = 72;

/**
 * How logos are drawn: `mono`, every mark flattened to one color of the surface so a wall of
 * different brands reads as one set (the usual way), or `color`, as the files draw them.
 */
export const LOGO_TONES = ['mono', 'color'] as const;

/**
 * One of {@link LOGO_TONES}.
 */
export type LogoTone = (typeof LOGO_TONES)[number];

/**
 * One logo: the organisation, its file, and an optical correction for a mark that looks too large
 * or too small beside the others.
 */
const Logo = Schema.Struct({
  name: textField(LOGO_NAME_MAX_CHARS, 'an organisation name'),
  src: Schema.optionalKey(Schema.NonEmptyString),
  scale: Schema.optionalKey(
    Schema.Number.check(
      Schema.isBetween(
        { minimum: 0.5, maximum: 1.5 },
        { message: 'Expected a scale from 0.5 to 1.5' },
      ),
    ),
  ),
});

/**
 * One logo as a slide's frontmatter writes it, decoded.
 */
export type LogoEntry = typeof Logo.Type;

/**
 * The variants of a wall of thirteen to eighteen, whose cells are a sixth of the row and shorter.
 */
const DENSE_VARIANTS: readonly LayoutVariant[] = [
  {
    name: '13 to 18 logos',
    when: { counts: { logos: { min: 13, max: MAX_LOGOS } } },
    budget: {},
    // Three rows leave a name drawn as a wordmark two short lines.
    fields: { 'logos[].name': { maxChars: LOGO_NAME_MAX_CHARS_DENSE } },
  },
];

/**
 * The contract of the `logos` layout: a wall of partner, customer or funder logos.
 */
export const logosLayoutContract = defineLayoutContract({
  name: 'logos',
  description:
    'A logo wall: three to eighteen partners, customers or funders, from `logos:` in the ' +
    'frontmatter (`name`, and `src`, a transparent SVG or PNG). Marks of any shape are sized to ' +
    'the same visual weight (a wide wordmark and a square emblem look equally large; `scale` ' +
    'corrects one that still looks off) and, with `tone: mono` (the default), flattened to one ' +
    'color of the surface so the wall reads as a set; `tone: color` keeps their colors, in the ' +
    "brand's `treatment` if you name one. A logo without a file is set as its name. Up to five " +
    'stand in one row; more fill two or three rows. The title says what the logos have in ' +
    'common ("Twelve partners fund the plan"). Use team for people.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    logos: Schema.Array(Logo).check(
      Schema.isMinLength(MIN_LOGOS, { message: `Expected at least ${MIN_LOGOS} logos` }),
      Schema.isMaxLength(MAX_LOGOS, { message: `Expected at most ${MAX_LOGOS} logos` }),
    ),
    tone: Schema.Literals(LOGO_TONES).pipe(
      Schema.withDecodingDefaultKey(Effect.succeed<LogoTone>('mono')),
    ),
    treatment: TreatmentField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    logos:
      `List ${MIN_LOGOS} to ${MAX_LOGOS} logos, each with \`name\` (up to ` +
      `${LOGO_NAME_MAX_CHARS} characters, ${LOGO_NAME_MAX_CHARS_DENSE} with thirteen or more) ` +
      'and `src` (a transparent SVG or PNG in the deck folder: assets/logos/acme.svg), ' +
      'and optionally `scale` (0.5 to 1.5) for a mark that looks too large or small.',
    tone:
      'Write `tone: color` to keep the logos in their own colors, or leave it out to set them ' +
      'all in one color of the surface.',
    treatment: TREATMENT_HINT,
    chrome: CHROME_HINT,
  },
  title: { required: true, maxChars: LOGOS_TITLE_MAX_CHARS },
  slots: {
    body: {
      description: 'One sentence under the title on what the organisations do together.',
      accepts: ['text'],
    },
    footnote: {
      description: 'A note on the bottom line, such as since when, or that the list is partial.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: CONTEXT_MAX_WORDS },
    footnote: { maxWords: 20 },
  },
  variants: DENSE_VARIANTS,
  pptx: {
    type: 'title-only',
    placeholders: [
      { kind: 'title', from: { selector: '.kit-title' } },
      { kind: 'body', from: { slot: 'body' } },
    ],
  },
  example: {
    comments: [
      'Give each logo its file from the deck folder, such as:',
      '  - name: Canopy Fund',
      '    src: assets/logos/canopy-fund.svg',
    ],
    frontmatter: {
      title: 'Six partners fund the first three years',
      eyebrow: 'Partners',
      logos: [
        { name: 'Larkfield Council' },
        { name: 'Eastgate General Hospital' },
        { name: 'Holloway Housing Co-op' },
        { name: 'Riverside Trust' },
        { name: 'Greenway Nurseries', scale: 0.9 },
        { name: 'Millbrook Water' },
      ],
    },
    body: [
      'Each partner funds trees on its own streets and shares the aftercare.',
      '',
      '<Notes>',
      'Name the hospital first: it is the partner the committee did not expect.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
