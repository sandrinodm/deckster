import { defineDeck } from '@deckster/engine/config';

/**
 * Small text the kit sets in a role color, on every surface: eyebrows, numbered lists, links, stat
 * deltas in both tones, a comparison's delta and a funnel's worst step. Lint it in each brand (the
 * `weak-accent` brand holds its accent only to 3:1): none of it may fail contrast.
 */
export default defineDeck({
  title: 'Role text fixture',
  slides: [
    'content-default',
    'stats-default',
    'content-inverse',
    'stats-inverse',
    'content-accent',
    'stats-accent',
    'content-gradient',
    'stats-gradient',
    'comparison',
    'funnel',
  ],
});
