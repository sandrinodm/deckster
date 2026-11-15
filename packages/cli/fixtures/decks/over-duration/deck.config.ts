import { defineDeck } from '@deckster/engine/config';

/**
 * A deck whose one slide has a speaking budget longer than the talk's duration.
 */
export default defineDeck({
  title: 'Over duration fixture',
  duration: '1m',
  slides: ['long-talk'],
});
