import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

/**
 * A deck code layout whose contract is fine and whose component fails to load.
 */
export default defineLayoutContract({
  name: 'broken',
  description: 'A layout whose component throws while it loads.',
  schema: Schema.Struct({}),
  slots: {
    body: { description: 'The content.', required: true, accepts: ['text'] },
  },
  budget: {},
  example: { frontmatter: {}, body: 'Hello\n' },
});
