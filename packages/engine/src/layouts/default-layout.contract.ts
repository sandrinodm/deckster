import { Schema } from 'effect';

import { defineLayoutContract } from '#contract/layout-contract.ts';
import { DEFAULT_LAYOUT } from '#contract/slide-defaults.ts';

/**
 * The contract of the engine's unstyled `default` layout, used when no plugin replaces it: the
 * slide's content in one padded column.
 */
export const engineDefaultContract = defineLayoutContract({
  name: DEFAULT_LAYOUT,
  description: 'Unstyled fallback: the slide content in one padded column.',
  schema: Schema.Struct({}),
  slots: {
    body: {
      description: 'Everything on the slide, top to bottom.',
      accepts: ['heading', 'text', 'bullets', 'image', 'component'],
    },
  },
  budget: {},
  example: {
    frontmatter: { title: 'Hello, deck' },
    body: '# Hello, deck\n\nOne idea per slide.\n',
  },
});
