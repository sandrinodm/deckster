import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import {
  AlignField,
  alignHint,
  CHROME_HINT,
  chromeField,
  EYEBROW_HINT,
  EyebrowField,
} from '#layout-fields.ts';

/**
 * How a statement marks the words the author emphasises (`*front door*` or `**front door**`):
 * `underline` sets them upright in the accent over a heavy rule in the accent, which reads on every
 * surface, also where the accent is the text color. Left out, emphasis is the type's own italic and
 * bold.
 */
export const STATEMENT_EMPHASES = ['underline'] as const;

/**
 * One of {@link STATEMENT_EMPHASES}.
 */
export type StatementEmphasis = (typeof STATEMENT_EMPHASES)[number];

/**
 * The sizes a statement can ask for besides its own: `giant` sets a few words across most of the
 * slide's width, larger than the display style.
 */
export const STATEMENT_SIZES = ['giant'] as const;

/**
 * One of {@link STATEMENT_SIZES}.
 */
export type StatementSize = (typeof STATEMENT_SIZES)[number];

/**
 * The most words a giant statement holds: a handful, so each word stays large.
 */
export const GIANT_STATEMENT_MAX_WORDS = 5;

/**
 * The name of the giant variant, which a `content-budget` finding prints after the limit, so it
 * says how to get the longer budget back.
 */
const GIANT_VARIANT = '`size: giant`; leave `size` out for a longer statement';

/**
 * The contract of the `statement` layout: one sentence, set large, that the audience should
 * remember.
 */
export const statementLayoutContract = defineLayoutContract({
  name: 'statement',
  description:
    'One sentence set large, on its own: the claim the talk turns on, or a quote. Up to three ' +
    'lines are set in the display style; a longer statement is set at quote size, in four lines ' +
    'at most, a little above the middle of the slide. Fill <Attribution> to set it as a quote ' +
    'with the speaker named below. Mark the two or three words that carry the claim with ' +
    'emphasis (`*front door*`) and write `emphasis: underline` to set them in the accent over a ' +
    'heavy rule, which reads on every surface. `align: center` centres a short statement on the ' +
    'slide, for a turn in the story or the ask. `size: giant` sets a statement of up to ' +
    `${GIANT_STATEMENT_MAX_WORDS} words across most of the slide, larger than the display ` +
    'style, for the one line a keynote is remembered by. Use it sparingly, at most once per ' +
    'part. ' +
    'Defaults to the inverse surface; `title:` names the slide in the outline and is not shown.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    emphasis: Schema.optionalKey(Schema.Literals(STATEMENT_EMPHASES)),
    align: AlignField,
    size: Schema.optionalKey(Schema.Literals(STATEMENT_SIZES)),
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    emphasis:
      'Write `emphasis: underline` to set the words you mark with `*...*` in the accent over a ' +
      'heavy rule, or leave it out to set emphasis in italics.',
    align: alignHint('the statement and its attribution'),
    size:
      `Write \`size: giant\` to set a statement of up to ${GIANT_STATEMENT_MAX_WORDS} words ` +
      'across most of the slide, or leave it out.',
    chrome: CHROME_HINT,
  },
  slots: {
    body: {
      description:
        'The statement: one sentence, or two short ones, no list. For a quote, write the words ' +
        'without quotation marks; the layout sets them. With `emphasis:`, mark the words that ' +
        'carry the claim, once: `Identity is now your *front door*`.',
      required: true,
      accepts: ['text', 'quote'],
    },
    attribution: {
      description:
        'Who said it: the name, then their role, for example "Dr. Amaka Bello, public health ' +
        'officer". Makes the statement a quote.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: 24 },
    attribution: { maxWords: 12 },
  },
  variants: [
    {
      name: GIANT_VARIANT,
      when: { fields: { size: 'giant' } },
      // A few words fill the slide; more would set each word smaller than the display style.
      budget: { body: { maxWords: GIANT_STATEMENT_MAX_WORDS } },
    },
  ],
  surface: 'inverse',
  pptx: {
    type: 'content',
    placeholders: [
      { kind: 'title', from: { field: 'title' } },
      { kind: 'body', from: { slot: 'body' } },
    ],
  },
  example: {
    frontmatter: {
      title: 'The second night of a heatwave is the worst',
      eyebrow: 'From the ward',
      emphasis: 'underline',
    },
    body: [
      'The worst nights are the *second and third* of a heatwave, when the flats never cool down.',
      '',
      '<Attribution>Mariam Haddad, charge nurse, Eastgate General</Attribution>',
      '',
      '<Notes>',
      'Read the quote slowly, then pause before the next slide.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
