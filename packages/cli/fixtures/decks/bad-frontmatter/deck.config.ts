import { defineDeck } from '@deckster/engine/config';

/**
 * A deck whose slide frontmatter breaks the schema.
 */
export default defineDeck({
  title: 'Bad frontmatter fixture',
  slides: ['broken'],
});
