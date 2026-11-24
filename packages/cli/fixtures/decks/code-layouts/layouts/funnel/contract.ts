import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

/**
 * A deck code layout for the CLI fixtures: the body as the stages of a funnel, at most three.
 */
export default defineLayoutContract({
  name: 'funnel',
  description: 'The body as the stages of a funnel.',
  schema: Schema.Struct({ stage: Schema.optionalKey(Schema.String) }),
  slots: {
    body: { description: 'The stages.', required: true, accepts: ['bullets', 'text'] },
  },
  budget: { body: { maxBullets: 3 } },
  example: { frontmatter: { stage: 'Trial' }, body: '- Visit\n- Trial\n' },
});
