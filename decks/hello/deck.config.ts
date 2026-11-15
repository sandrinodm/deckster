import { defineDeck } from '@deckster/engine/config';

/**
 * The sample deck: one slide of each kind the engine supports, one per brand surface. Change
 * `brand` to "nocturne" to restyle every slide.
 */
export default defineDeck({
  title: 'Hello, deck',
  brand: 'default',
  slides: ['title', 'steps', 'live-counter', 'closing'],
});
