import { defineDeck } from '@deckster/engine/config';

/**
 * Layouts fed the cases a review found broken: bright and busy photos under text, cards, steps and
 * timelines of every count, logo walls, teams with long names, tables both ways, closings with long
 * addresses. Shoot it in default and nocturne (and the CLI's `wide-sans` fixture brand) and look at
 * the images after changing a layout; `layout-probes.test.ts` lints it.
 */
export default defineDeck({
  title: 'Layout probes fixture',
  slides: [
    'image-snow-bottom',
    'image-snow-left',
    'image-grass-right',
    'image-night-bottom',
    'image-checker-left',
    'image-snow-alone',
    'image-grass-alone',
    'old-image-caption',
    'cards-2-short',
    'cards-3-long',
    'cards-4-long',
    'cards-2-bare',
    'cards-3-titles',
    'steps-3',
    'steps-4',
    'steps-5',
    'timeline-3',
    'timeline-5',
    'logos-6',
    'logos-4-color',
    'logos-4-color-inverse',
    'team-3-long',
    'team-8',
    'comparison-3',
    'table-markdown',
    'table-kit',
    'table-two',
    'quote-marks',
    'closing-long',
    'agenda-7',
  ],
});
