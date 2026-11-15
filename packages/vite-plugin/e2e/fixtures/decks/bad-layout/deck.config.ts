import { defineDeck } from '@deckster/engine/config';

/**
 * A deck whose only slide names a layout that does not exist.
 */
export default defineDeck({ title: 'Bad layout', slides: ['oops'] });
