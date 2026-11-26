import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import { WALL_DESCRIPTION } from '../_shared/labels.ts';

/**
 * A brand code layout for the e2e fixtures: the body as a wall of tiles.
 */
export default defineLayoutContract({
  name: 'kpi-wall',
  description: WALL_DESCRIPTION,
  schema: Schema.Struct({ columns: Schema.optionalKey(Schema.Literals([2, 3])) }),
  slots: {
    body: { description: 'The figures.', required: true, accepts: ['bullets', 'text'] },
  },
  budget: { body: { maxBullets: 6 } },
  example: { frontmatter: { columns: 3 }, body: '- 42% faster\n- 3 regions\n' },
});
