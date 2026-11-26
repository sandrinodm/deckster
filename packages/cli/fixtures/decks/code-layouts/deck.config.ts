import { defineDeck } from '@deckster/engine/config';

/**
 * A deck on a brand with a code layout, with a code layout of its own, one slide over that layout's
 * budget, and a layout whose component fails to load, which must break only the slide that uses
 * it.
 */
export default defineDeck({
  title: 'Code layouts',
  brand: 'code-brand',
  slides: ['brand-layout', 'deck-layout', 'over-budget', 'broken-layout', 'kit-layout'],
});
