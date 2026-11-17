import { defineDeck } from '@deckster/engine/config';

/**
 * The exemplar deck for the kit's first six layouts: a city forestry team's budget briefing on
 * planting shade where heat hits hardest. It uses every layout in each of its variants, on every
 * brand surface, including the hard cases (a long title, a full list, four stats, a dense split).
 * An appendix after the recommendation shows the options of the cover, divider and statement: a
 * full-bleed cover photo, large numerals, a divider beside a photo, centred slides and emphasis. It
 * comes last so the slides the tests open by position keep their numbers. Larkfield and its people
 * are fictional. Photos are CC0 from Wikimedia Commons (see `assets/CREDITS.txt`); the heat map is
 * drawn for this deck.
 */
export default defineDeck({
  title: 'Shade is infrastructure',
  brand: 'default',
  slides: [
    'cover',
    'hottest-afternoon',
    'part-why-eastgate',
    'canopy-gap',
    'heat-map',
    'why-eastgate',
    'night-nurse',
    'part-pilot',
    'pilot-results',
    'cooling-system',
    'big-species',
    'part-plan',
    'the-ask',
    'hottest-first',
    'costs-and-savings',
    'recommendation',
    'appendix-cover',
    'part-evidence',
    'seven-times',
    'part-aftercare',
    'first-quiet-july',
    'part-costs',
    'end-card',
    'giant-left',
    'giant-centred',
    'giant-word',
  ],
});
