import { defineBrandLayouts } from '@deckster/brand';

/**
 * The fixture brand's one layout: a cover whose title, subtitle and byline sit where its template
 * puts them, over its own art.
 */
export default defineBrandLayouts([
  {
    name: 'fx-cover',
    label: 'Fixture cover',
    description: 'A cover with the title low left, a subtitle and a byline, over pale blue art.',
    fallback: 'title',
    surface: 'default',
    title: { box: [120, 420, 1200, 300], type: 'display' },
    regions: [
      { bind: { slot: 'body' }, box: [120, 740, 1100, 120], type: 'lead' },
      { bind: { field: 'byline' }, box: [120, 900, 800, 60], type: 'label' },
    ],
    background: [{ type: 'image', file: 'art/cover.svg', fit: 'cover' }],
  },
]);
