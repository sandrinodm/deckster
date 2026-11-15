import { connectDeck } from '@deckster/app-bridge/client';

/**
 * The page's connection to the deck, which reports the error below without being asked.
 */
const deck = connectDeck();
deck.ready();
setTimeout(() => {
  throw new TypeError(
    `The thrower failed on purpose. ${'This sentence makes the message long enough to wrap. '.repeat(12)}`,
  );
}, 300);
