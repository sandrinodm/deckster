import { defineLayoutCatalog } from '@deckster/engine/layout';

import { columnsContract } from './columns-layout.contract.ts';

/**
 * The test layouts' contracts, which the suite's servers load as a layout catalog.
 */
export default defineLayoutCatalog({ source: 'e2e-fixtures', layouts: [columnsContract] });
