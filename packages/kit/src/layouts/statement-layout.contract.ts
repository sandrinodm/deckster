import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import { CHROME_HINT, chromeField, EYEBROW_HINT, EyebrowField } from '#layouts/layout-fields.ts';

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
    'with the speaker named below. Use it sparingly, at most once per part. Defaults to the ' +
    'inverse surface; `title:` names the slide in the outline and is not shown.',
  schema: Schema.Struct({ eyebrow: EyebrowField, chrome: chromeField(true) }),
  hints: { eyebrow: EYEBROW_HINT, chrome: CHROME_HINT },
  slots: {
    body: {
      description:
        'The statement: one sentence, or two short ones, no list. For a quote, write the words ' +
        'without quotation marks; the layout sets them.',
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
  surface: 'inverse',
  pptx: {
    type: 'content',
    placeholders: [
      { kind: 'title', from: { field: 'title' } },
      { kind: 'body', from: { slot: 'body' } },
    ],
  },
  example: {
    frontmatter: { title: 'What the night nurses told us', eyebrow: 'From the ward' },
    body: [
      'The worst nights are the second and third of a heatwave, when the flats never cool down.',
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
