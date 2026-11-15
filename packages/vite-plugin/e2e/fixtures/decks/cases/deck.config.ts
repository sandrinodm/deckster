import { defineDeck } from '@deckster/engine/config';

/**
 * Engine cases the hello deck does not cover: late, conditional and gapped steps, a CSS background
 * image, slots in MDX and TSX, and interactive content inside a slide.
 */
export default defineDeck({
  title: 'Engine cases',
  slides: ['late-steps', 'conditional-steps', 'background', 'columns', 'columns-tsx'],
});
