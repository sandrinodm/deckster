import { defineDeck } from '@deckster/engine/config';

/**
 * The diagram deck: a platform team at a parcel delivery company walks a new hire through how their
 * system behaves, with one diagram per slide. It shows every diagram form the kit has (a stepped
 * request journey, fan-out traffic, an agent loop, a failure and retry, an automatic layout, a
 * sequence diagram, a timeline, layers, a cycle, a tree, an imported SVG and a flow written in TSX)
 * on several surfaces, plus nodes that pick a standard card by name and a reference slide of the
 * five standard cards. Parcelwise and its systems are fictional.
 */
export default defineDeck({
  title: 'How Parcelwise moves a request',
  brand: 'default',
  duration: '18m',
  slides: [
    'cover',
    'request-journey',
    'order-events',
    'agent-loop',
    'card-retry',
    'service-map',
    'idempotent-charge',
    'migration-timeline',
    'platform-layers',
    'incident-loop',
    'pricing-tree',
    'warehouse-floor',
    'deploy-gates',
    'money-path',
    'card-reference',
  ],
});
