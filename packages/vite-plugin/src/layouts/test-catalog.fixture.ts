import engineCatalog from '@deckster/engine/catalog';
import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import type { CatalogLayout, LayoutCatalogIndex } from '#layouts/load-layout-catalog.ts';

/**
 * A two-column layout for tests: required `left` and `right` slots, an optional `caption`, and a
 * `ratio` field.
 */
export const splitContract = defineLayoutContract({
  name: 'split',
  description: 'Two columns.',
  schema: Schema.Struct({ ratio: Schema.optionalKey(Schema.Literals(['1:1', '2:1'])) }),
  hints: { ratio: 'Use `ratio: 1:1` or `ratio: 2:1`.' },
  slots: {
    left: { description: 'The argument.', required: true, accepts: ['bullets'] },
    right: { description: 'The evidence.', required: true, accepts: ['chart', 'image'] },
    caption: { description: 'A source line.', accepts: ['text'] },
  },
  budget: { left: { maxBullets: 4 } },
  example: {
    frontmatter: { ratio: '2:1' },
    body: '<Left>\n- a\n</Left>\n\n<Right>\nx\n</Right>\n',
  },
});

/**
 * The engine's `default` layout and {@link splitContract}, as the plugin indexes them.
 */
export const TEST_CATALOG: LayoutCatalogIndex = new Map<string, CatalogLayout>([
  ...engineCatalog.layouts.map(
    (contract) => [contract.name, { contract, source: '@deckster/engine' }] as const,
  ),
  ['split', { contract: splitContract, source: 'test' }],
]);
