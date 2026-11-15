import { defineDeck } from '@deckster/engine/config';

/**
 * The sample deck for mini apps: an inline `<Live>` widget, a scripted agent run in an `<AppFrame>`
 * that the slide's steps drive, and an external page with a poster and a recorded fallback. Nothing
 * here calls a model or needs an API key.
 */
export default defineDeck({
  title: 'Mini apps in a deck',
  brand: 'default',
  slides: ['title', 'counter', 'agent', 'external'],
});
