import { defineDeck } from '@deckster/engine/config';

/**
 * A deck that never starts: its second slide imports a name its helper does not export, so the
 * browser cannot link the page's modules and `window.__deck` is never defined.
 */
export default defineDeck({
  title: 'Bad import fixture',
  slides: ['fine', 'missing-export'],
});
