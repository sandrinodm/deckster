import path from 'node:path';

/**
 * The e2e fixture workspace, which has two brands that each define a layout: `fx-brand` (with
 * `fx-cover`) and `fx-other` (with `fx-hero`). Unit tests load them like a deck build does.
 */
export const FIXTURE_WORKSPACE = path.resolve(import.meta.dirname, '../../e2e/fixtures');
