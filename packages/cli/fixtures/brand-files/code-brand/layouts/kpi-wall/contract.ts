import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import { WALL_DESCRIPTION } from '../_shared/labels.ts';

/**
 * A brand code layout for the CLI fixtures: a heading over the body as a wall of tiles, exported to
 * PowerPoint as a title and content slide.
 */
export default defineLayoutContract({
  name: 'kpi-wall',
  description: WALL_DESCRIPTION,
  schema: Schema.Struct({ columns: Schema.optionalKey(Schema.Literals([2, 3])) }),
  slots: {
    body: { description: 'The figures.', required: true, accepts: ['bullets', 'text'] },
  },
  budget: { body: { maxBullets: 6 } },
  pptx: {
    type: 'content',
    placeholders: [
      { kind: 'title', from: { selector: '.kpi-wall-heading' } },
      { kind: 'body', from: { slot: 'body' } },
    ],
  },
  example: { frontmatter: { columns: 3 }, body: '- 42% faster\n- 3 regions\n' },
});
