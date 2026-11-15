import { defineDeck } from '@deckster/engine/config';

/**
 * A cover in the title layout, which draws the brand's logo on its top line, and a content slide
 * under the chrome. Render it in the `hidden-logo` and `no-logo` brands: neither may draw a logo.
 */
export default defineDeck({
  title: 'Logo cover fixture',
  slides: ['cover', 'content'],
});
