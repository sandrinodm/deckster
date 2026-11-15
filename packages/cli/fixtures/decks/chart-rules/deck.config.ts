import { defineDeck } from '@deckster/engine/config';

/**
 * Slides that break the chart lint rules (one breaks most of them; the others an empty chart, a
 * single-point line, a growing funnel) and slides that break none (`fine`, and nine lines with one
 * highlighted), rendered in Chromium by `chart-rules-deck.test.ts`.
 */
export default defineDeck({
  title: 'Chart rules fixture',
  slides: [
    'broken',
    'crowded',
    'spaghetti',
    'empty',
    'single-point',
    'funnel-grows',
    'highlighted-many',
    'fine',
  ],
});
