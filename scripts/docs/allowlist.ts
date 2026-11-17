/**
 * The decks the docs site publishes, in the order it lists them. Only these are exported, built and
 * shot for the site; any other folder under `decks/` stays private.
 */
export const DOCS_DECKS = [
  'hello',
  'showcase',
  'lookbook',
  'layouts',
  'components',
  'data-stories',
  'diagrams-demo',
  'exemplars',
  'apps-demo',
] as const;

/**
 * The brands the docs site publishes, in the order it lists them. Only these are exported and shot
 * for the site; any other folder under `brands/` stays private.
 */
export const DOCS_BRANDS = ['default', 'nocturne', 'fieldnote', 'kinetic', 'tidewater'] as const;
