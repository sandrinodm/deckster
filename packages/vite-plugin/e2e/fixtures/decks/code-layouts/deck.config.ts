import { defineDeck } from '@deckster/engine/config';

/**
 * A deck on the brand with code layouts (one of them replaces the kit's `title`), with a code
 * layout of its own and one whose component fails to load, which must break only the slide that
 * uses it.
 */
export default defineDeck({
  title: 'Code layouts',
  brand: 'fx-code',
  slides: ['brand-layout', 'deck-layout', 'broken-layout', 'kit-layout', 'cover'],
});
