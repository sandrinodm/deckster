import { defineDeck } from '@deckster/engine/config';

/**
 * Diagrams written the way an agent writes them: long names and labels, crossing edges, automatic
 * layouts with more ranks than fit, back edges, tight rows, self loops, wide trees, hostile SVG,
 * and cards, one of them a name no brand has. Each slide recreates a case a review found broken;
 * shoot it in both brands and look at the images after changing a diagram.
 */
export default defineDeck({
  title: 'Diagram probes fixture',
  slides: [
    'p-long-titles',
    'p-crossing',
    'p-auto-down',
    'p-back-edge',
    'p-tight-rows',
    'p-tree-wide',
    'p-self-loop',
    'p-timeline-current',
    'p-cycle-labels',
    'p-sequence',
    'p-states',
    'p-cards',
    'p-badge-edges',
    'p-badge-trapped',
    'p-tsx-flow',
    'p-svg-hostile',
  ],
});
