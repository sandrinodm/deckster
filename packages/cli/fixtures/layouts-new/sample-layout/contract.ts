import { defineLayoutContract } from '@deckster/engine/layout';
import { CHROME_HINT, chromeField, EYEBROW_HINT, EyebrowField } from '@deckster/kit/layout-fields';
import { Schema } from 'effect';

/**
 * The longest title, in characters: two lines at the title size.
 */
const TITLE_MAX_CHARS = 60;

/**
 * The layout's contract: the fields a slide sets, the slot it fills, how much fits, an example and
 * the PowerPoint mapping. Contracts run in Node: import only `effect`, `@deckster/engine/layout`,
 * `@deckster/kit/layout-fields`, `@deckster/brand` and `.ts` files in this folder or in
 * `layouts/_shared/`.
 */
export default defineLayoutContract({
  name: 'sample-layout',
  description:
    'A title that states the point, then a short paragraph or up to five bullets. Say here ' +
    'when to pick this layout over the others.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    chrome: CHROME_HINT,
  },
  title: { required: true, maxChars: TITLE_MAX_CHARS },
  slots: {
    body: {
      description: 'A short paragraph, up to five bullets, or a sentence followed by bullets.',
      required: true,
      accepts: ['text', 'bullets'],
    },
  },
  budget: { body: { maxWords: 60, maxBullets: 5 } },
  pptx: {
    type: 'content',
    placeholders: [
      { kind: 'title', from: { selector: '.kit-title' } },
      { kind: 'body', from: { slot: 'body' } },
    ],
  },
  example: {
    frontmatter: { title: 'Every slide makes one point', eyebrow: 'How we write slides' },
    body: [
      'The title says the point; the body backs it up.',
      '',
      '- One idea per slide',
      '- A title that reads as a sentence',
      '- Detail in the speaker notes, not on the slide',
      '',
      '<Notes>Say the title first, then the three habits behind it.</Notes>',
      '',
    ].join('\n'),
  },
});
