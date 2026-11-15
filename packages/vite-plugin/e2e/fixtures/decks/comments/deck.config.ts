import { defineDeck } from '@deckster/engine/config';

/**
 * Source stamping and comments: an MDX and a TSX slide, each filling slots and using a component
 * from the deck folder and one from the kit.
 */
export default defineDeck({
  title: 'Comment cases',
  slides: ['notes-mdx', 'cards-tsx'],
});
