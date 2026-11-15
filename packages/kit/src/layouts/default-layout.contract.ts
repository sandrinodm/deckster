import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

/**
 * The contract of the kit's `default` layout: one column of content in the brand's slide margins,
 * under an accent rule.
 */
export const defaultLayoutContract = defineLayoutContract({
  name: 'default',
  description:
    'One column of content under an accent rule, centred on the slide: a heading with a lead ' +
    'paragraph, or a heading with a short list. Use it when no more specific layout fits.',
  schema: Schema.Struct({}),
  slots: {
    body: {
      description:
        'A heading (# or ##), then a paragraph or up to six bullets; steps and images allowed.',
      required: true,
      accepts: ['heading', 'text', 'bullets', 'image', 'component'],
    },
  },
  budget: { body: { maxWords: 80, maxBullets: 6 } },
  pptx: {
    type: 'content',
    placeholders: [
      { kind: 'title', from: { field: 'title' } },
      { kind: 'body', from: { slot: 'body' } },
    ],
  },
  example: {
    frontmatter: { title: 'How steps work', budget: '1m' },
    body: [
      '## How steps work',
      '',
      '<Step at={1}>',
      '- Each slide has one integer step, starting at 0.',
      '</Step>',
      '',
      '<Step at={2}>',
      '- Going back into a slide lands on its last step.',
      '</Step>',
      '',
      '<Notes>',
      'Reveal one point per key press.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
