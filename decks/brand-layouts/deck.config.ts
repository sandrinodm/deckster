import { defineDeck } from '@deckster/engine/config';

/**
 * A test deck for brand layouts: fieldnote's four own layouts, each used at least once, with a few
 * kit layouts between them. Change `brand` to "tidewater" to see them fall back.
 */
export default defineDeck({
  title: 'Street trees, ten years on',
  brand: 'fieldnote',
  slides: [
    'title',
    'what-we-did',
    'part-one',
    'findings',
    'planting',
    'numbers',
    'part-two',
    'method',
    'closing',
  ],
});
