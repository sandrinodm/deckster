import { defineDeck } from '@deckster/engine/config';

/**
 * Mini app cases the apps-demo deck must not show: an app the deck does not have, an app that
 * throws, a host that does not answer (with a recording) and an outside page with no bridge.
 */
export default defineDeck({
  title: 'App cases',
  slides: ['missing-app', 'thrower', 'unreachable', 'no-bridge'],
});
