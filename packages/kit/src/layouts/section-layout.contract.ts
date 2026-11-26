import { defineLayoutContract, type FieldProblem } from '@deckster/engine/layout';
import { Schema } from 'effect';

import {
  AlignField,
  alignHint,
  CHROME_HINT,
  chromeField,
  EYEBROW_HINT,
  EyebrowField,
  TREATMENT_HINT,
  TreatmentField,
} from '#layout-fields.ts';

/**
 * The longest section number, in characters: `02`, `IV` or `Q3`.
 */
export const SECTION_NUMBER_MAX_CHARS = 3;

/**
 * The longest part title, in characters: two lines of display type at the smallest fit step, or
 * three in the seven columns a photo leaves.
 */
export const SECTION_TITLE_MAX_CHARS = 40;

/**
 * The most words of the summary beside a picture, where it has seven columns.
 */
export const SECTION_SUMMARY_MAX_WORDS_WITH_MEDIA = 14;

/**
 * How the part number is set: `small`, on the top line in the display style (the default), or
 * `large`, as a graphic in the surface's own tone, so large it runs off the bottom of the slide
 * behind the title.
 */
export const SECTION_NUMERALS = ['small', 'large'] as const;

/**
 * One of {@link SECTION_NUMERALS}.
 */
export type SectionNumeral = (typeof SECTION_NUMERALS)[number];

/**
 * Problems with a divider's fields that the schema cannot see: a large numeral with no number to
 * set.
 *
 * @param frontmatter - The decoded fields.
 * @returns The problem at `numeral`, or none.
 */
export function sectionProblems(frontmatter: {
  readonly numeral?: SectionNumeral | undefined;
  readonly number?: number | string | undefined;
}): FieldProblem[] {
  if (frontmatter.numeral !== 'large' || frontmatter.number !== undefined) {
    return [];
  }

  return [
    {
      path: 'numeral',
      message: '`numeral: large` sets the part number large, but the slide has no `number:`.',
      fix: 'Number the part (`number: 2`), or leave `numeral` out.',
    },
  ];
}

/**
 * The contract of the `section` layout: a divider that opens a part of the talk.
 */
export const sectionLayoutContract = defineLayoutContract({
  name: 'section',
  description:
    'A divider that opens a part of the talk: its number set large at the top, the part title ' +
    'on the bottom line and an optional one-sentence summary, whose two lines are kept free ' +
    'when it is left out so every divider sets its title at the same height. `numeral: large` ' +
    'makes the number a landmark: set in the surface tone, so large it runs off the bottom of ' +
    'the slide behind the title. `align: center` centres the number, title and summary on the ' +
    'slide. Fill <Media> with a photo for the part to fill the right five columns edge to edge; ' +
    'the text then stays on the left. Use one per part, in order, all on the same surface and ' +
    'with the same options, so the dividers read as a set. Defaults to the accent surface and ' +
    'hides the page chrome.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    number: Schema.optionalKey(
      Schema.Union([
        Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 99 })),
        Schema.NonEmptyString.check(Schema.isMaxLength(SECTION_NUMBER_MAX_CHARS)),
      ]),
    ),
    numeral: Schema.optionalKey(Schema.Literals(SECTION_NUMERALS)),
    align: AlignField,
    treatment: TreatmentField,
    chrome: chromeField(false),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    number:
      'Number the part, for example `number: 2` (shown as 02) or `number: IV`, ' +
      `in up to ${SECTION_NUMBER_MAX_CHARS} characters.`,
    numeral:
      'Write `numeral: large` to set the number as a large graphic behind the title, or leave it ' +
      'out for the number on the top line.',
    align: alignHint('the number, title and summary'),
    treatment: TREATMENT_HINT,
    chrome: CHROME_HINT,
  },
  checks: (frontmatter) => sectionProblems(frontmatter),
  title: { required: true, maxChars: SECTION_TITLE_MAX_CHARS },
  slots: {
    body: {
      description:
        'One sentence on what this part covers. Set the part title in `title:` (two to five ' +
        'words).',
      accepts: ['text'],
    },
    media: {
      description:
        'A photo for the part, as one <img> with alt text; it fills the right five columns of ' +
        'the slide edge to edge, in the brand image treatment, and the text keeps to the left ' +
        '(`align: center` does not apply). Leave it out for a type-only divider.',
      accepts: ['image'],
    },
  },
  budget: {
    body: { maxWords: 16 },
  },
  variants: [
    {
      name: 'with media',
      when: { filled: ['media'] },
      budget: { body: { maxWords: SECTION_SUMMARY_MAX_WORDS_WITH_MEDIA } },
    },
  ],
  surface: 'accent',
  pptx: {
    type: 'section',
    placeholders: [
      { kind: 'title', from: { selector: '.kit-section-title' } },
      { kind: 'body', from: { slot: 'body' } },
    ],
  },
  example: {
    frontmatter: { title: 'The plan', number: '02', eyebrow: 'Part two', numeral: 'large' },
    body: [
      'Where we plant, in what order, and what it costs each year.',
      '',
      '<Notes>',
      'Say how long this part takes and what the committee will decide at its end.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
