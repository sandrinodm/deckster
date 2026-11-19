/**
 * The decks the docs site publishes, in the order it lists them. Only these are exported, built and
 * shot for the site; any other folder under `decks/` stays private. `brand-layouts` follows the kit
 * layouts because it shows the layouts a brand brings; it renders with `fieldnote`, so that brand
 * has to stay on {@link DOCS_BRANDS}.
 */
export const DOCS_DECKS = [
  'hello',
  'showcase',
  'lookbook',
  'layouts',
  'brand-layouts',
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
