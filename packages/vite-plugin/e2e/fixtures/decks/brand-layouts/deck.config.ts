import { defineDeck } from '@deckster/engine/config';

/**
 * A deck in the fixture brand, with one slide on its own layout and one on the layout of another
 * brand, which renders with that layout's kit fallback.
 */
export default defineDeck({
  title: 'Brand layouts',
  brand: 'fx-brand',
  slides: ['own-layout', 'other-layout', 'other-layout-tsx'],
});
