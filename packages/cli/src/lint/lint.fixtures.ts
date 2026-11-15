import path from 'node:path';

/**
 * A workspace of deliberately broken decks used by the lint tests.
 */
export const FIXTURE_WORKSPACE = path.resolve(import.meta.dirname, '../../fixtures');

/**
 * The repository's own workspace (`decks/` and `brands/` at the repository root): the demo decks
 * the tests render, covering every layout, chart, diagram, component and mini app.
 */
export const DEMO_WORKSPACE = path.resolve(import.meta.dirname, '../../../..');
