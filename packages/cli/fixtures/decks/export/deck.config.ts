import { defineDeck } from '@deckster/engine/config';

/**
 * The export fixture: one slide per thing `deckster export` maps to a native PowerPoint object that
 * the shipped decks do not have yet: links, a table, step reveals, published chart and diagram
 * descriptions, a scrim over a photo, and links and a rounded drawing on a gradient surface.
 */
export default defineDeck({
  title: 'Export fixture',
  slides: ['links', 'table', 'steps', 'figures', 'scrim', 'contact'],
});
