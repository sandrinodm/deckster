import { defineBrandLayouts } from '@deckster/brand';

/**
 * The second fixture brand's one layout: a hero with an eyebrow, over its own art. The first
 * fixture brand does not have it, so a deck in that brand falls back to the `title` layout.
 */
export default defineBrandLayouts([
  {
    name: 'fx-hero',
    label: 'Fixture hero',
    description: 'A hero with the title at the top, an eyebrow above it and a subtitle below.',
    fallback: 'title',
    surface: 'default',
    title: { box: [120, 300, 1400, 300], type: 'display' },
    regions: [
      { bind: { field: 'eyebrow' }, box: [120, 200, 800, 60], type: 'label' },
      { bind: { slot: 'body' }, box: [120, 640, 1100, 120], type: 'lead' },
    ],
    background: [{ type: 'image', file: 'art/hero.svg', fit: 'cover' }],
  },
]);
