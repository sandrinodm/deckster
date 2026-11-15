import { defineDeck } from '@deckster/engine/config';

/**
 * The layout catalogue: every kit layout added after the six exemplars, in each of its variants,
 * told as the Larkfield Urban Forestry Division's annual review of its canopy programme. One part
 * per layout, each opened by a divider, so the deck doubles as a kitchen sink for the layouts in
 * every brand. Larkfield, its people, partners and figures are fictional; portraits and logos are
 * drawn for this deck, and the photos are CC0 from Wikimedia Commons (see `assets/CREDITS.txt`).
 */
export default defineDeck({
  title: 'The canopy programme in every layout',
  brand: 'default',
  duration: '45m',
  slides: [
    'cover',
    'part-agenda',
    'agenda-plan',
    'agenda-current',
    'agenda-day',
    'part-team',
    'team-row',
    'team-grid',
    'team-roster',
    'part-people',
    'quote-portrait',
    'quote-plain',
    'bio-speaker',
    'bio-initials',
    'part-cards',
    'cards-principles',
    'cards-benefits',
    'cards-options',
    'part-steps',
    'steps-planting',
    'steps-adopt',
    'steps-three',
    'part-comparison',
    'comparison-species',
    'comparison-funding',
    'part-timeline',
    'timeline-plan',
    'timeline-decade',
    'part-table',
    'table-schedule',
    'table-aside',
    'table-dense',
    'part-logos',
    'logos-six',
    'logos-color',
    'logos-wall',
    'part-image',
    'image-bottom',
    'image-side',
    'image-alone',
    'part-closing',
    'closing-ask',
    'closing-questions',
  ],
});
