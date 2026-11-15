import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

/**
 * A test layout: the body above two columns, both required.
 */
export const columnsContract = defineLayoutContract({
  name: 'columns',
  description: 'The body as a heading above two columns.',
  schema: Schema.Struct({ gap: Schema.optionalKey(Schema.Literals(['tight', 'loose'])) }),
  slots: {
    body: { description: 'The heading.', accepts: ['heading'] },
    left: { description: 'The claim.', required: true, accepts: ['bullets', 'text'] },
    right: { description: 'The evidence.', required: true, accepts: ['component', 'image'] },
  },
  budget: { left: { maxBullets: 4 } },
  example: {
    frontmatter: { gap: 'loose' },
    body: '## Heading\n\n<Left>\n- Claim\n</Left>\n\n<Right>\nEvidence\n</Right>\n',
  },
});
